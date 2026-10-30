import type { HarnessMode, ModeProfileProvider } from '@ciro-code/harness-shared';
import { copyToClipboard } from './clipboard.js';
import { consumeInput } from './input/parse-key.js';
import type { KeyContext } from './keymap/bindings.js';
import { resolveCommand } from './keymap/resolve.js';
import {
  acquireWorkspaceLock,
  releaseWorkspaceLock,
  type WorkspaceLockInfo,
} from './lock/workspace-lock.js';
import {
  backspaceInput,
  expandPasteMarks,
  isMultilinePaste,
  makePasteMark,
  normalizePasteText,
} from './paste-blocks.js';
import {
  applySelectionHighlight,
  extractSelectionText,
  selectionIsEmpty,
  type TextSelection,
} from './selection.js';
import { createTuiStore } from './store/tui-store.js';
import { detectCapabilities } from './terminal/capabilities.js';
import { TerminalScreen } from './terminal/screen.js';
import { createInProcessTransport } from './transport/in-process.js';
import { linesToPlain } from './tui-kit/ansi.js';
import { FrameBuffer } from './tui-kit/frame.js';
import { approvalChoices, clampChoiceIndex } from './widgets/choice-panel.js';
import {
  buildComposerContentMap,
  inputRangeFromSelection,
  replaceInputRange,
} from './widgets/composer-selection.js';
import { COMPOSER_PROMPT } from './widgets/composer.js';
import { buildFrame, cycleMode } from './widgets/layout.js';
import { stringWidth } from './width/measure.js';

export interface StartTuiOptions {
  workspace: string;
  mode?: HarnessMode;
  mock?: boolean;
  continue?: boolean;
  resume?: string;
  allowConcurrent?: boolean;
  profile?: string;
  modeProfiles?: ModeProfileProvider;
}

export async function startTui(opts: StartTuiOptions): Promise<void> {
  const workspace = opts.workspace;
  const lock = acquireWorkspaceLock(workspace, 'tui', {
    allowConcurrent: opts.allowConcurrent,
  });
  if (!lock.ok) {
    const e = lock.existing;
    const msg = formatLockConflict(e);
    console.error(msg);
    process.exitCode = 1;
    return;
  }

  const sessionIdPrefix = opts.allowConcurrent ? '.tui-' : undefined;
  const caps = detectCapabilities();
  const screen = new TerminalScreen(caps);
  const transport = createInProcessTransport({
    workspace,
    mode: opts.mode,
    agentBackend: opts.mock ? 'mock' : 'pi',
    profile: opts.profile,
    modeProfiles: opts.modeProfiles,
    sessionIdPrefix,
  });

  const store = createTuiStore({ mode: opts.mode ?? 'agent' });
  let follow = true;
  let scrollOffset = 0;
  let focus: 'composer' | 'scrollback' = 'composer';
  let running = true;
  let gitBranch: string | null = null;
  let dirty = true;
  let inputBuf = '';
  let history: string[] = [];
  let historyIdx = -1;
  let animTick = 0;
  let lastHits: import('./tui-kit/types.js').HitTarget[] = [];
  let hoveredId: string | null = null;
  let overlayIndex = 0;
  let lastPermissionId: string | null = null;
  let selection: TextSelection | null = null;
  let selecting = false;
  let lastPlainLines: string[] = [];
  const pasteBlocks = new Map<number, string>();
  let pasteSeq = 0;
  let lastComposerGeom: {
    boxTopRow: number;
    bodyRowCount: number;
    width: number;
    promptW: number;
  } | null = null;

  const frame = new FrameBuffer((s) => screen.write(s), caps.synchronizedOutput, caps);

  const teardown = () => {
    if (!running) return;
    running = false;
    try {
      screen.exit();
    } catch {
      // ignore
    }
    try {
      transport.dispose();
    } catch {
      // ignore
    }
    releaseWorkspaceLock(workspace);
  };

  const onSignal = () => {
    teardown();
    process.exit(0);
  };
  process.on('exit', teardown);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('uncaughtException', (err) => {
    teardown();
    console.error(err);
    process.exit(1);
  });

  screen.enter();

  // session bootstrap
  let sessionId: string;
  if (opts.resume) {
    const resumed = await transport.resumeSession(opts.resume);
    sessionId = resumed.session.id;
    store.setSessionId(sessionId);
    store.setMode(resumed.session.mode);
    if (resumed.session.modelRef) store.setModelRef(resumed.session.modelRef);
    store.patch({
      messages: resumed.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: 'completed' as const,
      })),
    });
  } else if (opts.continue) {
    const list = await transport.listSessions();
    const last = list.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (last) {
      const resumed = await transport.resumeSession(last.id);
      sessionId = resumed.session.id;
      store.setSessionId(sessionId);
      store.setMode(resumed.session.mode);
      if (resumed.session.modelRef) store.setModelRef(resumed.session.modelRef);
      store.patch({
        messages: resumed.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          status: 'completed' as const,
        })),
      });
    } else {
      const s = await transport.createSession({
        workspace,
        mode: opts.mode ?? 'agent',
      });
      sessionId = s.id;
      store.setSessionId(sessionId);
      store.setMode(s.mode);
      if (s.modelRef) store.setModelRef(s.modelRef);
    }
  } else {
    const s = await transport.createSession({
      workspace,
      mode: opts.mode ?? 'agent',
    });
    sessionId = s.id;
    store.setSessionId(sessionId);
    store.setMode(s.mode);
    if (s.modelRef) store.setModelRef(s.modelRef);
  }

  void transport.getGitStatus().then((g) => {
    gitBranch = g?.branch ?? null;
    dirty = true;
  });

  const paint = () => {
    if (!running) return;
    const slice = store.get();
    const cols = process.stdout.columns || caps.columns;
    const rows = process.stdout.rows || caps.rows;
    // Reserve last column: many hosts wrap when a line fills `cols`, eating ╮/╯/│
    const layoutCols = Math.max(2, cols - 1);
    const workedSec =
      slice.turnStartedAt && slice.status === 'streaming'
        ? Math.max(1, Math.round((Date.now() - slice.turnStartedAt) / 1000))
        : null;
    const ctxPct =
      slice.contextUsage != null
        ? Math.round((slice.contextUsage.usageRatio ?? 0) * 100)
        : null;
    // 新权限请求时重置选项下标
    const permId = slice.permission?.permissionId ?? null;
    if (permId !== lastPermissionId) {
      lastPermissionId = permId;
      overlayIndex = 0;
    }
    const built = buildFrame({
      width: layoutCols,
      height: rows,
      messages: slice.messages,
      input: slice.input,
      mode: slice.mode,
      modelLabel: slice.modelRef?.modelId ?? (opts.mock ? 'mock' : 'default'),
      branch: gitBranch,
      ctxPct,
      follow,
      scrollOffset: follow ? 0 : scrollOffset,
      permission: slice.permission,
      overlayIndex,
      autocomplete: slice.autocomplete,
      welcome: slice.messages.length === 0,
      streaming: slice.status === 'streaming',
      workedSec,
      mouseHint: caps.mouse,
      focus,
      workspaceLabel: workspace,
      expandedIds: slice.expandedIds,
      hoveredId,
      pasteBlocks,
      animTick,
      nowMs: Date.now(),
    });
    lastHits = built.hits;
    lastComposerGeom =
      built.composerBoxTopRow >= 0
        ? {
            boxTopRow: built.composerBoxTopRow,
            bodyRowCount: built.composerBodyRowCount,
            width: built.composerWidth,
            promptW: stringWidth(COMPOSER_PROMPT),
          }
        : null;
    const painted = applySelectionHighlight(built.lines, selection);
    lastPlainLines = linesToPlain(painted).split('\n');
    frame.paint(painted, rows, cols);
    dirty = false;
  };

  const prunePasteBlocks = (next: string) => {
    for (const id of [...pasteBlocks.keys()]) {
      if (!next.includes(makePasteMark(id))) pasteBlocks.delete(id);
    }
  };

  /** 若选区落在 composer 正文：删除/替换该段并清选区；返回是否已处理 */
  const applyComposerSelectionEdit = (insert = ''): boolean => {
    if (!selection || selectionIsEmpty(selection) || !lastComposerGeom) return false;
    const slice = store.get();
    const maxBody = Math.max(1, Math.min(8, Math.floor(Math.max(8, process.stdout.rows || 24) / 4)));
    const cells = buildComposerContentMap(
      slice.input,
      pasteBlocks,
      lastComposerGeom.width,
      maxBody,
    );
    const range = inputRangeFromSelection(selection, lastComposerGeom, cells);
    if (!range) return false;
    const next = replaceInputRange(slice.input, range.start, range.end, insert);
    prunePasteBlocks(next);
    store.setInput(next);
    clearSelection();
    return true;
  };

  const clearSelection = () => {
    if (selection) {
      selection = null;
      dirty = true;
    }
  };

  const copySelection = async () => {
    if (!selection || selectionIsEmpty(selection)) return false;
    const text = extractSelectionText(lastPlainLines, selection);
    if (!text.trim()) return false;
    await copyToClipboard(text, (seq) => screen.write(seq));
    return true;
  };

  store.subscribe(() => {
    dirty = true;
  });

  const schedulePaint = () => {
    setImmediate(() => {
      if (dirty) paint();
    });
  };

  process.stdout.on('resize', () => {
    frame.resize();
    dirty = true;
    schedulePaint();
  });

  const keyStack = (): KeyContext[] => {
    const slice = store.get();
    if (slice.permission) return ['Overlay'];
    if (slice.autocomplete) return ['Autocomplete', 'Composer'];
    if (focus === 'scrollback') return ['Scrollback'];
    return ['Composer'];
  };

  const submitChat = async () => {
    const slice = store.get();
    const display = slice.input.trim();
    if (!display || slice.status === 'streaming') return;
    if (display === '/exit' || display === '/quit') {
      teardown();
      process.exit(0);
    }
    if (display.startsWith('/mode')) {
      const next = cycleMode(slice.mode);
      await transport.setMode(sessionId, next);
      store.setMode(next);
      store.setInput('');
      pasteBlocks.clear();
      return;
    }
    // 展开粘贴 chip 后再发送 / 入历史
    const text = expandPasteMarks(slice.input, pasteBlocks).trim();
    if (!text) return;
    history.push(text);
    historyIdx = -1;
    // beginTurn 读 store.input：先写入展开后的正文
    store.setInput(text);
    pasteBlocks.clear();
    const assistantId = crypto.randomUUID();
    store.beginTurn(assistantId);
    follow = true;
    scrollOffset = 0;
    try {
      for await (const ev of transport.send(sessionId, { message: text }, { mode: slice.mode })) {
        if (!running) break;
        const action = store.applyEvent(ev);
        dirty = true;
        schedulePaint();
        if (action === 'break') break;
      }
    } catch (err) {
      store.patch({
        error: err instanceof Error ? err.message : String(err),
        status: 'error',
      });
    } finally {
      store.endTurn();
      dirty = true;
      schedulePaint();
    }
  };

  const insertPaste = (raw: string) => {
    const body = normalizePasteText(raw);
    if (!body) return;
    const slice = store.get();
    if (isMultilinePaste(body)) {
      pasteSeq += 1;
      const id = pasteSeq;
      pasteBlocks.set(id, body);
      store.setInput(slice.input + makePasteMark(id));
    } else {
      store.setInput(slice.input + body);
    }
  };

  const handleCommand = async (cmd: string) => {
    const slice = store.get();
    switch (cmd) {
      case 'app:exit':
        teardown();
        process.exit(0);
        break;
      case 'app:interrupt':
        // 有选区时 Ctrl+C 优先复制（贴终端习惯）
        if (selection && !selectionIsEmpty(selection)) {
          await copySelection();
          clearSelection();
          break;
        }
        if (slice.status === 'streaming') {
          await transport.abort(sessionId);
          store.endTurn(true);
        } else if (slice.input) {
          store.setInput('');
          pasteBlocks.clear();
        } else {
          teardown();
          process.exit(0);
        }
        break;
      case 'selection:copy':
        await copySelection();
        break;
      case 'app:redraw':
        frame.resize();
        dirty = true;
        break;
      case 'chat:submit':
        await submitChat();
        break;
      case 'chat:newline':
        if (!applyComposerSelectionEdit('\n')) {
          store.setInput(slice.input + '\n');
        }
        break;
      case 'chat:cycleMode': {
        const next = cycleMode(slice.mode);
        await transport.setMode(sessionId, next);
        store.setMode(next);
        break;
      }
      case 'chat:cancelOrDismiss':
        if (slice.autocomplete) store.setAutocomplete(null);
        else if (slice.status === 'streaming') {
          await transport.abort(sessionId);
          store.endTurn(true);
        } else {
          store.setInput('');
          pasteBlocks.clear();
        }
        break;
      case 'scroll:pageUp':
        follow = false;
        scrollOffset += Math.max(1, Math.floor((process.stdout.rows || 24) / 2));
        break;
      case 'scroll:pageDown':
        scrollOffset = Math.max(0, scrollOffset - Math.max(1, Math.floor((process.stdout.rows || 24) / 2)));
        if (scrollOffset === 0) follow = true;
        break;
      case 'scroll:follow':
        follow = true;
        scrollOffset = 0;
        break;
      case 'scroll:top':
        follow = false;
        scrollOffset = 10_000;
        break;
      case 'focus:scrollback':
        focus = 'scrollback';
        break;
      case 'focus:composer':
        focus = 'composer';
        break;
      case 'slash:open':
        store.setInput(slice.input.endsWith('/') ? slice.input : slice.input + '/');
        store.setAutocomplete('slash');
        break;
      case 'mention:open':
        store.setInput(slice.input.endsWith('@') ? slice.input : slice.input + '@');
        store.setAutocomplete('mention');
        break;
      case 'confirm:yes':
        if (slice.permission) {
          const permissionId = slice.permission.permissionId;
          await transport.resolvePermission(permissionId, 'allow');
          store.patch({
            permissions: slice.permissions.filter((p) => p.permissionId !== permissionId),
          });
          overlayIndex = 0;
        } else if (slice.autocomplete) {
          store.setAutocomplete(null);
        }
        break;
      case 'confirm:no':
        if (slice.permission) {
          const permissionId = slice.permission.permissionId;
          await transport.resolvePermission(permissionId, 'deny');
          store.patch({
            permissions: slice.permissions.filter((p) => p.permissionId !== permissionId),
          });
          overlayIndex = 0;
        } else store.setAutocomplete(null);
        break;
      case 'overlay:prev':
        if (slice.permission) {
          overlayIndex = clampChoiceIndex(overlayIndex - 1, approvalChoices().length);
        }
        break;
      case 'overlay:next':
        if (slice.permission) {
          overlayIndex = clampChoiceIndex(overlayIndex + 1, approvalChoices().length);
        }
        break;
      case 'overlay:confirm':
        if (slice.permission) {
          const choice = approvalChoices()[overlayIndex];
          await handleCommand(choice?.id === 'deny' ? 'confirm:no' : 'confirm:yes');
          return;
        }
        break;
      case 'overlay:dismiss':
        store.setAutocomplete(null);
        break;
      case 'history:prev':
        if (!history.length) break;
        historyIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
        store.setInput(history[historyIdx] ?? '');
        break;
      case 'history:next':
        if (historyIdx < 0) break;
        historyIdx += 1;
        if (historyIdx >= history.length) {
          historyIdx = -1;
          store.setInput('');
        } else store.setInput(history[historyIdx] ?? '');
        break;
      default:
        break;
    }
    dirty = true;
    schedulePaint();
  };

  paint();

  process.stdin.on('data', (chunk: Buffer | string) => {
    if (!running) return;
    inputBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const { events, rest } = consumeInput(inputBuf);
    inputBuf = rest;
    void (async () => {
      for (const ev of events) {
        if (ev.type === 'mouse') {
          const row0 = Math.max(0, ev.event.y - 1);
          const col0 = Math.max(0, ev.event.x - 1);
          if (ev.event.kind === 'wheel') {
            follow = false;
            if (ev.event.button === 64) scrollOffset += 3;
            else if (ev.event.button === 65) {
              scrollOffset = Math.max(0, scrollOffset - 3);
              if (scrollOffset === 0) follow = true;
            }
            dirty = true;
            schedulePaint();
          } else if (ev.event.kind === 'click' && ev.event.button === 0) {
            // 开始拖选
            selecting = true;
            selection = {
              anchor: { row: row0, col: col0 },
              focus: { row: row0, col: col0 },
            };
            dirty = true;
            schedulePaint();
          } else if (ev.event.kind === 'move') {
            // button 32 = 按住左键拖动
            if (selecting || (ev.event.button >= 32 && (ev.event.button & 3) === 0)) {
              selecting = true;
              const anchor = selection?.anchor ?? { row: row0, col: col0 };
              selection = { anchor, focus: { row: row0, col: col0 } };
              dirty = true;
              schedulePaint();
            } else {
              const hit = [...lastHits].reverse().find((h) => h.row === row0);
              const nextHover =
                hit?.kind === 'timeline-toggle' && hit.id ? hit.id : null;
              if (nextHover !== hoveredId) {
                hoveredId = nextHover;
                dirty = true;
                schedulePaint();
              }
            }
          } else if (ev.event.kind === 'release') {
            const wasSelecting = selecting;
            const drag =
              selection &&
              (selection.anchor.row !== selection.focus.row ||
                selection.anchor.col !== selection.focus.col);
            selecting = false;
            if (wasSelecting && drag) {
              // 仅保留选区高亮；复制需 Ctrl+C / y（不自动复制）
              selection = {
                anchor: selection!.anchor,
                focus: { row: row0, col: col0 },
              };
              // 选区落在 composer 时切回输入焦点，便于 Backspace 删除
              if (
                lastComposerGeom &&
                row0 >= lastComposerGeom.boxTopRow &&
                row0 <= lastComposerGeom.boxTopRow + lastComposerGeom.bodyRowCount + 1
              ) {
                focus = 'composer';
              }
              dirty = true;
              schedulePaint();
            } else {
              // 单击：清选区并走原 hit 逻辑
              clearSelection();
              const rows = process.stdout.rows || caps.rows;
              const hit = [...lastHits].reverse().find((h) => h.row === row0);
              if (hit?.kind === 'timeline-toggle' && hit.id) {
                store.toggleExpanded(hit.id);
                focus = 'scrollback';
              } else if (hit?.kind === 'approval-yes') {
                overlayIndex = 0;
                await handleCommand('confirm:yes');
              } else if (hit?.kind === 'approval-no') {
                overlayIndex = 1;
                await handleCommand('confirm:no');
              } else if (hit?.kind === 'composer' || row0 >= rows - 4) {
                focus = 'composer';
              } else {
                focus = 'scrollback';
              }
              dirty = true;
              schedulePaint();
            }
          }
          continue;
        }
        const cmd = resolveCommand(keyStack(), ev.event);
        if (cmd) {
          await handleCommand(cmd);
          continue;
        }
        // 括号粘贴：多行收成 [Pasted N lines] chip；有选区则先替换选区
        if (ev.event.name === 'paste' && ev.event.char != null) {
          if (focus === 'scrollback') focus = 'composer';
          if (applyComposerSelectionEdit('')) {
            // 选区已清空，继续插入粘贴内容
          } else {
            clearSelection();
          }
          insertPaste(ev.event.char);
          dirty = true;
          schedulePaint();
          continue;
        }
        // 可打印字符 / 退格：若在 scrollback 焦点则自动回到输入，避免「按 Tab 后像卡死」
        if (ev.event.name === 'char' && ev.event.char) {
          if (focus === 'scrollback') focus = 'composer';
          if (focus === 'composer') {
            // 有选区：用新字符替换选中文字
            if (!applyComposerSelectionEdit(ev.event.char)) {
              clearSelection();
              const slice = store.get();
              const next = slice.input + ev.event.char;
              store.setInput(next);
              if (ev.event.char === '/') store.setAutocomplete('slash');
              else if (ev.event.char === '@') store.setAutocomplete('mention');
              else if (slice.autocomplete && !next.includes('/') && !next.includes('@')) {
                store.setAutocomplete(null);
              }
            }
            dirty = true;
            schedulePaint();
          }
        } else if (ev.event.name === 'backspace') {
          if (focus === 'scrollback') focus = 'composer';
          if (focus === 'composer') {
            // 有选区：直接删掉选中段
            if (!applyComposerSelectionEdit('')) {
              clearSelection();
              const slice = store.get();
              const next = backspaceInput(slice.input);
              prunePasteBlocks(next);
              store.setInput(next);
            }
            dirty = true;
            schedulePaint();
          }
        }
      }
    })();
  });

  // 保持事件循环；流式中持续刷新 spinner / 实时秒数
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (!running) {
        clearInterval(timer);
        resolve();
        return;
      }
      const streaming = store.get().status === 'streaming';
      if (streaming) animTick += 1;
      if (dirty || streaming) paint();
    }, 80);
  });
}

function formatLockConflict(e: WorkspaceLockInfo): string {
  if (e.kind === 'web') {
    return `Web daemon is running (pid ${e.pid}). Quit it first, or pass --allow-concurrent (sessions will not see each other).`;
  }
  return `Another TUI instance is running (pid ${e.pid}). Quit it first, or pass --allow-concurrent.`;
}
