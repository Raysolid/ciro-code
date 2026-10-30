import { describe, expect, it } from 'vitest';
import {
  formatShellCardOutput,
  formatShellPreview,
  findShellPermission,
  matchesShellPermission,
  shellCommandMeta,
  tokenizeShellCommand,
} from './shell-highlight.js';

describe('tokenizeShellCommand', () => {
  it('highlights command, flags, and strings', () => {
    const tokens = tokenizeShellCommand(
      'pnpm exec vitest run src/a.test.ts --reporter=dot',
    );
    expect(tokens.filter((t) => t.kind === 'command').map((t) => t.text)).toEqual([
      'pnpm',
    ]);
    expect(tokens.some((t) => t.kind === 'flag' && t.text === '--reporter=dot')).toBe(
      true,
    );
  });

  it('resets command after pipe', () => {
    const tokens = tokenizeShellCommand('Get-ChildItem -Name | Select-Object');
    const commands = tokens.filter((t) => t.kind === 'command').map((t) => t.text);
    expect(commands).toEqual(['Get-ChildItem', 'Select-Object']);
    expect(tokens.some((t) => t.kind === 'flag' && t.text === '-Name')).toBe(true);
    expect(tokens.some((t) => t.kind === 'operator' && t.text === '|')).toBe(true);
  });

  it('keeps quoted strings intact', () => {
    const tokens = tokenizeShellCommand(`echo "hello world" 'x'`);
    const strings = tokens.filter((t) => t.kind === 'string').map((t) => t.text);
    expect(strings).toEqual([`"hello world"`, `'x'`]);
  });
});

describe('formatShellPreview', () => {
  it('unwraps tool result JSON envelope', () => {
    const raw = JSON.stringify({
      content: [{ type: 'text', text: 'exit 0\nstdout:\nok' }],
      details: { error: false, exitCode: 0 },
    });
    expect(formatShellPreview(raw)).toBe('exit 0\nstdout:\nok');
  });

  it('leaves plain preview unchanged', () => {
    expect(formatShellPreview('Test Files  1 passed')).toBe('Test Files  1 passed');
  });

  it('unwraps a clipped JSON envelope and decodes escapes', () => {
    const text =
      '[ERROR] COMPILATION ERROR :\r\n[ERROR] /D:/workspace/resume-agent/Foo.java' +
      'x'.repeat(400);
    const raw = JSON.stringify({
      content: [{ type: 'text', text }],
      details: { error: true, exitCode: 1 },
    }).slice(0, 300);
    expect(() => JSON.parse(raw)).toThrow();
    const out = formatShellPreview(raw);
    expect(out.startsWith('[ERROR] COMPILATION ERROR :')).toBe(true);
    expect(out).toContain('\n');
    expect(out).not.toContain('\\r\\n');
    expect(out.startsWith('{')).toBe(false);
  });
});

describe('formatShellCardOutput', () => {
  it('drops exit line and stdout/stderr labels', () => {
    expect(
      formatShellCardOutput('exit 0\nstdout:\nok\n\nstderr:\nwarn'),
    ).toBe('ok\n\nwarn');
  });

  it('keeps error body after stripping the envelope', () => {
    const raw = JSON.stringify({
      content: [
        {
          type: 'text',
          text: "exit 255\nstdout:\n'file' 不是内部或外部命令\n\nstderr:\n'od' 不是内部或外部命令",
        },
      ],
    });
    expect(formatShellCardOutput(raw)).toBe(
      "'file' 不是内部或外部命令\n\n'od' 不是内部或外部命令",
    );
  });
});

describe('shellCommandMeta', () => {
  it('uses first command name when description is present', () => {
    expect(shellCommandMeta('pnpm exec vitest', 'bash', true)).toBe('pnpm');
  });

  it('falls back to tool name without description', () => {
    expect(shellCommandMeta('pnpm exec vitest', 'bash', false)).toBe('bash');
  });
});

describe('matchesShellPermission', () => {
  it('prefers toolCallId over command', () => {
    const item = {
      kind: 'tool' as const,
      id: 'tc-1',
      toolName: 'bash',
      status: 'running' as const,
      toolInput: { command: 'git push' },
    };
    expect(
      matchesShellPermission(item, {
        toolName: 'bash',
        toolCallId: 'tc-1',
        toolInput: { command: 'other' },
      }),
    ).toBe(true);
    expect(
      matchesShellPermission(item, {
        toolName: 'bash',
        toolCallId: 'other-id',
        toolInput: { command: 'git push' },
      }),
    ).toBe(false);
  });

  it('falls back to command when no toolCallId', () => {
    const item = {
      kind: 'tool' as const,
      id: 't1',
      toolName: 'bash',
      status: 'running' as const,
      toolInput: { command: 'git push' },
    };
    expect(
      matchesShellPermission(item, {
        toolName: 'bash',
        toolInput: { command: 'git push' },
      }),
    ).toBe(true);
    expect(
      matchesShellPermission(item, {
        toolName: 'bash',
        toolInput: { command: 'ls' },
      }),
    ).toBe(false);
  });

  it('findShellPermission picks matching id from queue', () => {
    const item = {
      kind: 'tool' as const,
      id: 'tc-2',
      toolName: 'bash',
      status: 'running' as const,
      toolInput: { command: 'echo 2' },
    };
    const hit = findShellPermission(item, [
      { toolName: 'bash', toolCallId: 'tc-1', permissionId: 'p1' },
      { toolName: 'bash', toolCallId: 'tc-2', permissionId: 'p2' },
    ]);
    expect(hit?.permissionId).toBe('p2');
  });
});
