import { describe, expect, it } from 'vitest';
import { formatToolsForContextEstimate, roughTokenEstimate } from './token-estimate.js';

describe('formatToolsForContextEstimate', () => {
  it('includes description and parameters so estimate exceeds name-only', () => {
    const namesOnly = 'read\nbash\nSuggestMode';
    const withSchema = formatToolsForContextEstimate([
      {
        name: 'read',
        description: 'Read a file from the workspace',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'relative path' } },
          required: ['path'],
        },
      },
      {
        name: 'bash',
        description: 'Run a shell command',
        parameters: { type: 'object', properties: { command: { type: 'string' } } },
      },
      { name: 'SuggestMode', description: 'Suggest switching mode' },
    ]);
    expect(roughTokenEstimate(withSchema)).toBeGreaterThan(roughTokenEstimate(namesOnly));
    expect(withSchema).toContain('relative path');
    expect(withSchema).toContain('SuggestMode');
  });

  it('returns empty for no tools', () => {
    expect(formatToolsForContextEstimate([])).toBe('');
  });
});
