import { describe, expect, it } from 'vitest';
import { linesToAnsi, linesToPlain } from '../tui-kit/ansi.js';
import type { ChatMessage } from '@ciro-code/harness-timeline';
import { buildFrame, cycleMode } from './layout.js';

function base(over: Partial<Parameters<typeof buildFrame>[0]> = {}) {
  return buildFrame({
    width: 80,
    height: 28,
    messages: [],
    input: '',
    mode: 'ask',
    modelLabel: 'mock',
    follow: true,
    scrollOffset: 0,
    permission: null,
    autocomplete: null,
    welcome: true,
    streaming: false,
    mouseHint: false,
    workspaceLabel: 'demo',
    ...over,
  });
}

describe('buildFrame visual chrome', () => {
  it('welcome: two-column logo | meta/tips; meta above Welcome', () => {
    const { lines, composerRow } = base({ width: 100, height: 28, welcome: true });
    const plain = linesToPlain(lines);
    expect(plain).toContain('██');
    expect(plain).toContain('Welcome back!');
    expect(composerRow).toBeGreaterThan(0);
  });

  it('welcome logo keeps per-cell colors', () => {
    const { lines } = base({ width: 100, height: 28, welcome: true });
    const eyeRow = lines.find((l) => l.some((s) => s.text.includes('▌')));
    expect(eyeRow).toBeTruthy();
    expect(eyeRow!.find((s) => s.text.includes('█'))?.fg).toBe('toolRun');
  });

  it('composer: closed rounded box, gray border, mode·model on bottom', () => {
    const { lines } = base({ welcome: false, height: 12, mode: 'ask', modelLabel: 'gpt-test', input: 'hi' });
    const plain = linesToPlain(lines);
    expect(plain).toContain('❯ hi');
    expect(plain).toMatch(/╰─+ Ask · gpt-test ──╯/);
    const ansi = linesToAnsi(lines, null);
    expect(ansi).toMatch(/\x1b\[32mAsk/);
  });

  it('dock row always present; ctx on the right (not below composer)', () => {
    const { lines } = base({
      welcome: false,
      height: 14,
      mode: 'ask',
      modelLabel: 'mock',
      ctxPct: 12,
      branch: 'main',
    });
    const plain = linesToPlain(lines);
    expect(plain).toContain('ctx 12%');
    expect(plain).toContain('main');
    // dock 上方有 1 空行，再是对话区；dock 紧邻 composer 顶边
    const rows = plain.split('\n');
    const topIdx = rows.findIndex((l) => l.includes('╭'));
    expect(topIdx).toBeGreaterThan(1);
    expect(rows[topIdx - 1]).toMatch(/ctx 12%/);
    expect(rows[topIdx - 2]?.trim()).toBe('');
  });

  it('dock streaming: activity left + ctx right', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi', status: 'completed' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        timeline: [
          { kind: 'thought', id: 't1', text: 'plan', startedAt: Date.now() - 1000, ended: false },
        ],
      },
    ];
    const { lines } = base({
      welcome: false,
      messages,
      streaming: true,
      workedSec: 2,
      ctxPct: 5,
      height: 18,
      animTick: 0,
    });
    const plain = linesToPlain(lines);
    expect(plain).toMatch(/Thinking…/);
    expect(plain).toContain('ctx 5%');
    expect(plain).toMatch(/▸ Thinking…/);
  });

  it('scrollback focus: shortcuts stay default; dock above composer', () => {
    const { lines } = base({
      welcome: false,
      input: 'hi',
      focus: 'scrollback',
      width: 80,
      height: 12,
      mouseHint: true,
      ctxPct: 1,
    });
    const plain = linesToPlain(lines);
    expect(plain).not.toContain('SCROLL');
    expect(plain).toContain('? help');
    expect(plain).toContain('drag');
    expect(plain).toMatch(/sel|copy/);
    const rows = plain.split('\n');
    const bottomIdx = rows.findIndex((l) => l.includes('╰'));
    expect(rows[bottomIdx + 1]).toContain('? help');
  });

  it('composer grows for multi-line input', () => {
    const { lines } = base({
      welcome: false,
      height: 20,
      width: 50,
      input: 'one\ntwo\nthree',
    });
    const plain = linesToPlain(lines);
    expect(plain).toContain('❯ one');
    expect(plain).toMatch(/two/);
    expect(plain).toMatch(/three/);
  });

  it('approval replaces composer with choice panel', () => {
    const { lines, hits } = base({
      welcome: false,
      height: 24,
      permission: {
        permissionId: 'p1',
        toolName: 'bash',
        reason: 'Command is outside the readonly bash allowlist',
        toolInput: { command: 'rm -rf /tmp/x' },
      },
      overlayIndex: 0,
    });
    const plain = linesToPlain(lines);
    expect(plain).toContain('Approval: bash');
    expect(plain).toMatch(/Allow/);
    expect(plain).toMatch(/Deny/);
    expect(plain).toContain('Enter: select');
    // composer 被替换：无输入框 ❯（欢迎/对话区可能有用户气泡 ❯，无权限时才有 composer）
    expect(plain).not.toMatch(/╰─+ Ask/);
    expect(hits.some((h) => h.kind === 'approval-yes')).toBe(true);
    expect(hits.some((h) => h.kind === 'approval-no')).toBe(true);
  });

  it('user band: full-bleed bg; prompt indented inside; 1 blank above', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hello', status: 'completed' },
    ];
    const { lines } = base({
      welcome: false,
      messages,
      height: 16,
      width: 40,
    });
    const firstContent = lines.findIndex((l) => l.some((s) => s.text.includes('❯')));
    expect(firstContent).toBe(2);
    expect(linesToPlain([lines[0]!]).trim()).toBe('');
    const band = lines[firstContent]!;
    // 背景通栏：首段即为带 bg 的缩进空格，无外侧 gutter
    expect(band[0]?.bg).toBe('userBg');
    expect(band[0]?.text).toBe('  ');
    expect(band.some((s) => s.text.includes('❯'))).toBe(true);
  });

  it('tool groups fold consecutive tools; single tool has no fold mark', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hello', status: 'completed' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'done',
        status: 'completed',
        turnMode: 'agent',
        turnModelLabel: 'deepseek-chat',
        workedMs: 5000,
        timeline: [
          { kind: 'thought', id: 't1', text: 'plan detail', startedAt: Date.now() - 3000, ended: true, durationSec: 3 },
          { kind: 'tool', id: 'k1', toolName: 'read', status: 'done', preview: 'a.ts', toolInput: { path: 'a.ts' } },
          { kind: 'tool', id: 'k2', toolName: 'read', status: 'done', preview: 'b.ts', toolInput: { path: 'b.ts' } },
          { kind: 'text', id: 'x1', text: 'all good' },
        ],
      },
    ];
    const { lines, hits } = base({
      welcome: false,
      messages,
      mode: 'agent',
      ctxPct: 43,
      height: 24,
    });
    const plain = linesToPlain(lines);
    expect(plain).toContain('Thought for 3s');
    expect(plain).toMatch(/Explored|Read/); // group summary or single
    expect(plain).not.toContain('plan detail');
    expect(plain).not.toMatch(/Agent · deepseek-chat/);
    const groupHit = hits.find((h) => h.kind === 'timeline-toggle' && h.id?.startsWith('tg-'));
    expect(groupHit || hits.some((h) => h.id === 't1')).toBeTruthy();

    const expanded = base({
      welcome: false,
      messages,
      height: 28,
      expandedIds: new Set(['t1', 'tg-k1']),
    });
    const exp = linesToPlain(expanded.lines);
    expect(exp).toContain('plan detail');
    expect(exp).toMatch(/>\s*Read/);
  });

  it('single shell tool: short Ran header; expand card has $ cmd + output', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'pwd', status: 'completed' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        status: 'completed',
        timeline: [
          {
            kind: 'tool',
            id: 'sh1',
            toolName: 'bash',
            status: 'done',
            toolInput: { command: 'pwd' },
            preview: 'exit 0\nstdout:\nD:\\workspace\\ciro-chat\n',
          },
        ],
      },
    ];
    const collapsed = base({ welcome: false, messages, height: 20 });
    const cPlain = linesToPlain(collapsed.lines);
    expect(cPlain).toMatch(/>\s*Ran/);
    expect(cPlain).not.toMatch(/[▸▾]/);
    expect(cPlain).not.toContain('D:\\workspace\\ciro-chat');
    // 收起时不展示完整命令卡
    expect(cPlain).not.toMatch(/\$\s*pwd/);

    const expanded = base({
      welcome: false,
      messages,
      height: 24,
      expandedIds: new Set(['tg-sh1']),
    });
    const ePlain = linesToPlain(expanded.lines);
    expect(ePlain).toMatch(/\$\s*pwd/);
    expect(ePlain).toContain('D:\\workspace\\ciro-chat');
    // hover/展开不加浅底
    const head = expanded.lines.find((l) => l.some((s) => s.text.includes('Ran')));
    expect(head?.some((s) => s.bg === 'userBg')).toBeFalsy();
    // 通栏卡：结果行带 bg，且正文缩进与 Ran 对齐（pad=4）
    const outRow = expanded.lines.find((l) =>
      l.some((s) => s.text.includes('ciro-chat')),
    );
    expect(outRow?.[0]?.bg).toBe('userBg');
    expect(outRow?.[0]?.text).toBe('    ');
  });

  it('failed tool appends red × without painting whole line danger', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'x', status: 'completed' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        status: 'completed',
        timeline: [
          {
            kind: 'tool',
            id: 'g1',
            toolName: 'grep',
            status: 'error',
            toolInput: { pattern: 'foo' },
            preview: 'not found',
          },
        ],
      },
    ];
    const { lines } = base({ welcome: false, messages, height: 16 });
    const row = lines.find((l) => l.some((s) => s.text.includes('Grepped') || s.text.includes('grep')));
    expect(row).toBeTruthy();
    expect(row!.some((s) => s.text.includes('×') && s.fg === 'danger')).toBe(true);
    // verb/target 本身不是整行 danger
    const verb = row!.find((s) => /Grep|grep|Listed|Read/i.test(s.text) && !s.text.includes('×'));
    expect(verb?.fg).not.toBe('danger');
  });

  it('pins last user bubble when scrolled past it', () => {
    const many: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'first question sticky', status: 'completed' },
      {
        id: 'a1',
        role: 'assistant',
        content: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'),
        status: 'completed',
        turnMode: 'ask',
        turnModelLabel: 'm',
        workedMs: 1000,
        timeline: [
          {
            kind: 'text',
            id: 'x1',
            text: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'),
            ended: true,
          },
        ],
      },
    ];
    const { lines } = base({
      welcome: false,
      messages: many,
      height: 16,
      width: 60,
      follow: true,
      scrollOffset: 0,
    });
    const plain = linesToPlain(lines);
    // sticky user should appear near top of viewport
    const rows = plain.split('\n');
    const userRow = rows.findIndex((l) => l.includes('first question sticky'));
    expect(userRow).toBeGreaterThanOrEqual(0);
    expect(userRow).toBeLessThan(5);
  });
});

describe('cycleMode', () => {
  it('cycles four modes', () => {
    expect(cycleMode('agent')).toBe('plan');
    expect(cycleMode('plan')).toBe('ask');
    expect(cycleMode('ask')).toBe('debug');
    expect(cycleMode('debug')).toBe('agent');
  });
});
