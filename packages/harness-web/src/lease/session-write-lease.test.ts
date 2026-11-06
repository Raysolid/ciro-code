import { describe, expect, it } from 'vitest';
import { SessionWriteLeaseManager } from './session-write-lease.js';

describe('SessionWriteLeaseManager', () => {
  it('grants first holder and rejects second', () => {
    const m = new SessionWriteLeaseManager(60_000);
    const a = m.acquire('s1', 'tui-a');
    expect(a).not.toBeNull();
    expect(m.acquire('s1', 'tui-b')).toBeNull();
    expect(m.hasWriteAccess('s1', a!.token)).toBe(true);
    expect(m.hasWriteAccess('s1', 'other')).toBe(false);
  });

  it('allows renew and release then re-acquire', () => {
    const m = new SessionWriteLeaseManager(60_000);
    const a = m.acquire('s1', 'web');
    expect(a).not.toBeNull();
    expect(m.renew('s1', a!.token)?.holderId).toBe('web');
    expect(m.release('s1', a!.token)).toBe(true);
    const b = m.acquire('s1', 'tui');
    expect(b?.holderId).toBe('tui');
  });

  it('expires so another holder can take over', async () => {
    const m = new SessionWriteLeaseManager(30);
    const a = m.acquire('s1', 'a');
    expect(a).not.toBeNull();
    await new Promise((r) => setTimeout(r, 40));
    const b = m.acquire('s1', 'b');
    expect(b?.holderId).toBe('b');
  });
});
