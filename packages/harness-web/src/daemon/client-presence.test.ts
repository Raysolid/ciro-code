import { describe, expect, it, vi } from 'vitest';
import { DaemonClientPresence } from './client-presence.js';

describe('DaemonClientPresence', () => {
  it('does not shut down while another client remains after leave', async () => {
    vi.useFakeTimers();
    const onEmpty = vi.fn();
    const hub = new DaemonClientPresence({
      graceMs: 1_000,
      staleMs: 60_000,
      sweepMs: 60_000,
      onEmpty,
    });
    hub.touch('tui-1');
    hub.touch('web-1');
    hub.leave('web-1');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onEmpty).not.toHaveBeenCalled();
    expect(hub.size).toBe(1);

    hub.leave('tui-1');
    await vi.advanceTimersByTimeAsync(999);
    expect(onEmpty).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    hub.dispose();
    vi.useRealTimers();
  });

  it('cancels empty shutdown when a client touches again', async () => {
    vi.useFakeTimers();
    const onEmpty = vi.fn();
    const hub = new DaemonClientPresence({
      graceMs: 1_000,
      staleMs: 60_000,
      sweepMs: 60_000,
      onEmpty,
    });
    hub.touch('web-1');
    hub.leave('web-1');
    await vi.advanceTimersByTimeAsync(500);
    hub.touch('tui-1');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onEmpty).not.toHaveBeenCalled();
    hub.dispose();
    vi.useRealTimers();
  });

  it('reaps stale clients after missed heartbeats (crash / terminal kill)', async () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    const onEmpty = vi.fn();
    const hub = new DaemonClientPresence({
      graceMs: 500,
      staleMs: 30_000,
      sweepMs: 5_000,
      onEmpty,
      now: () => now,
    });
    hub.touch('tui-dead');
    hub.touch('web-live');
    expect(hub.size).toBe(2);

    // web 续租；tui 失联
    now += 20_000;
    hub.touch('web-live');
    now += 15_000; // tui lastSeen 已超过 30s
    hub.sweepStale();
    expect(hub.size).toBe(1);
    expect(onEmpty).not.toHaveBeenCalled();

    hub.leave('web-live');
    await vi.advanceTimersByTimeAsync(500);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    hub.dispose();
    vi.useRealTimers();
  });

  it('leaveByPrefix removes matching clients and can empty the hub', async () => {
    vi.useFakeTimers();
    const onEmpty = vi.fn();
    const hub = new DaemonClientPresence({
      graceMs: 500,
      staleMs: 60_000,
      sweepMs: 60_000,
      onEmpty,
    });
    hub.touch('web-aaa');
    hub.touch('web-bbb');
    hub.touch('tui-1');
    expect(hub.leaveByPrefix('web-')).toBe(2);
    expect(hub.size).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(onEmpty).not.toHaveBeenCalled();
    hub.leave('tui-1');
    await vi.advanceTimersByTimeAsync(500);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    hub.dispose();
    vi.useRealTimers();
  });

  it('last stale client triggers shutdown after grace', async () => {
    vi.useFakeTimers();
    let now = 0;
    const onEmpty = vi.fn();
    const hub = new DaemonClientPresence({
      graceMs: 1_000,
      staleMs: 10_000,
      sweepMs: 60_000,
      onEmpty,
      now: () => now,
    });
    hub.touch('only');
    now += 11_000;
    hub.sweepStale();
    expect(hub.size).toBe(0);
    expect(onEmpty).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    hub.dispose();
    vi.useRealTimers();
  });
});
