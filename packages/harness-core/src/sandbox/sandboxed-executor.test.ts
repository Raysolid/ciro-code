import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decodeShellBuffer, runSandboxed } from './sandboxed-executor.js';

describe('decodeShellBuffer', () => {
  it('keeps valid utf-8', () => {
    expect(decodeShellBuffer(Buffer.from('exit 1\n你好', 'utf8'))).toBe('exit 1\n你好');
  });

  it('decodes windows gbk when utf-8 would be replacement chars', () => {
    // GBK: 你好
    const gbk = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]);
    const decoded = decodeShellBuffer(gbk);
    if (process.platform === 'win32') {
      expect(decoded).toBe('你好');
    } else {
      // 非 Windows 保持 utf8 结果（可能含 U+FFFD）
      expect(decoded).toBe(gbk.toString('utf8'));
    }
  });
});

describe('SandboxedExecutor', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-exec-'));
  writeFileSync(join(workspace, 'hello.txt'), 'hi');

  it('runs command in workspace cwd', async () => {
    const result = await runSandboxed({
      cwd: workspace,
      command: 'echo hello',
      timeoutMs: 5000,
    });
    expect(result.timedOut).toBe(false);
    expect(result.stdout.toLowerCase()).toContain('hello');
  });

  it('times out long commands', async () => {
    const isWin = process.platform === 'win32';
    const result = await runSandboxed({
      cwd: workspace,
      command: isWin ? 'ping -n 5 127.0.0.1' : 'sleep 5',
      timeoutMs: 500,
    });
    expect(result.timedOut).toBe(true);
  }, 10_000);
});
