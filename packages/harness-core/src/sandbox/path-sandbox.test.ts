import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertReadable, assertWritable, resolveWorkspacePath, SandboxError } from './path-sandbox.js';

describe('path-sandbox', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-sandbox-'));
  writeFileSync(join(workspace, 'README.md'), '# Test');

  it('resolves path within workspace', () => {
    const abs = resolveWorkspacePath(workspace, 'README.md');
    expect(abs).toContain('README.md');
  });

  it('rejects path escape', () => {
    expect(() => resolveWorkspacePath(workspace, '../../../etc/passwd')).toThrow(SandboxError);
  });

  it('denies .env files', () => {
    expect(() => assertReadable(workspace, '.env')).toThrow(SandboxError);
  });

  it('allows normal files', () => {
    const abs = assertReadable(workspace, 'README.md');
    expect(abs).toContain('README.md');
  });

  it('allows global AGENTS.md outside workspace', () => {
    const abs = assertWritable(workspace, '~/.ciro/AGENTS.md');
    expect(abs.replace(/\\/g, '/')).toMatch(/\.ciro\/AGENTS\.md$/);
  });

  it('legacy global AGENTS alias still resolves to primary path', () => {
    const abs = assertWritable(workspace, '~/.pi/agent/AGENTS.md');
    expect(abs.replace(/\\/g, '/')).toMatch(/\.ciro\/AGENTS\.md$/);
  });
});
