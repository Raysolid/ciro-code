import { describe, expect, it } from 'vitest';
import {
  ASK_TOOLS,
  DEVELOPER_TOOLS,
  TOOL_CACHE_ANCHOR,
  mergeSessionToolEnvelope,
  sortToolsForCache,
} from './tools.js';

describe('sortToolsForCache', () => {
  it('places SuggestMode last as cache anchor', () => {
    const sorted = sortToolsForCache(['Task', 'SuggestMode', 'read', 'bash']);
    expect(sorted.at(-1)).toBe(TOOL_CACHE_ANCHOR);
    expect(sorted.indexOf('read')).toBeLessThan(sorted.indexOf('bash'));
  });

  it('sorts non-canonical names before the anchor', () => {
    const sorted = sortToolsForCache(['SuggestMode', 'mcp:z', 'mcp:a', 'read']);
    expect(sorted.at(-1)).toBe('SuggestMode');
    expect(sorted.indexOf('mcp:a')).toBeLessThan(sorted.indexOf('mcp:z'));
    expect(sorted.indexOf('mcp:z')).toBeLessThan(sorted.indexOf('SuggestMode'));
  });
});

describe('mergeSessionToolEnvelope', () => {
  it('grows monotonically from ask to agent without shrinking on ask again', () => {
    const ask = mergeSessionToolEnvelope(undefined, ASK_TOOLS);
    expect(ask.grew).toBe(false);
    expect(ask.envelope.at(-1)).toBe(TOOL_CACHE_ANCHOR);

    const agent = mergeSessionToolEnvelope(ask.envelope, DEVELOPER_TOOLS);
    expect(agent.grew).toBe(true);
    expect(agent.envelope).toEqual(expect.arrayContaining(['write', 'edit', ...ASK_TOOLS]));

    const backToAsk = mergeSessionToolEnvelope(agent.envelope, ASK_TOOLS);
    expect(backToAsk.grew).toBe(false);
    expect(backToAsk.envelope).toEqual(agent.envelope);
  });
});
