import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { TOOL_DEFINITIONS, parseToolArguments, buildSystemPrompt } = require('../src/lib/agentProtocol');

describe('agentProtocol', () => {
  it('exposes required tools', () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.function.name);
    expect(names).toContain('open_webpage');
    expect(names).toContain('open_many_tabs');
    expect(names).toContain('search_people');
    expect(names).toContain('fill_credentials');
  });

  it('parses valid JSON tool arguments', () => {
    expect(parseToolArguments('{"url":"https://example.com"}')).toEqual({ url: 'https://example.com' });
  });

  it('returns empty object for invalid tool arguments', () => {
    expect(parseToolArguments('{bad-json')).toEqual({});
  });

  it('builds a non-empty system prompt', () => {
    expect(buildSystemPrompt().length).toBeGreaterThan(20);
  });
});
