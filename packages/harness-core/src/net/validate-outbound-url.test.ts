import { describe, expect, it } from 'vitest';
import {
  validateOutboundUrl,
  validateOutboundUrlSync,
} from './validate-outbound-url.js';

describe('validateOutboundUrlSync', () => {
  it('allows public https', () => {
    const r = validateOutboundUrlSync('https://api.example.com/mcp');
    expect(r.ok).toBe(true);
  });

  it('rejects localhost and private IPs', () => {
    expect(validateOutboundUrlSync('http://localhost/mcp').ok).toBe(false);
    expect(validateOutboundUrlSync('http://127.0.0.1/mcp').ok).toBe(false);
    expect(validateOutboundUrlSync('http://10.0.0.1/mcp').ok).toBe(false);
    expect(validateOutboundUrlSync('http://192.168.1.1/mcp').ok).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(validateOutboundUrlSync('ftp://example.com/').ok).toBe(false);
  });
});

describe('validateOutboundUrl', () => {
  it('rejects hosts that resolve to loopback when possible', async () => {
    // 多数环境 localhost 会解析到 127.0.0.1；静态层已拦
    const r = await validateOutboundUrl('http://localhost/mcp');
    expect(r.ok).toBe(false);
  });

  it('allows well-known public host after DNS', async () => {
    const r = await validateOutboundUrl('https://example.com/');
    expect(r.ok).toBe(true);
  });
});
