import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normalizeUrl, boundTabCount, sanitizeNames } = require('../src/lib/browserCore');

describe('browserCore.normalizeUrl', () => {
  it('returns default for empty input', () => {
    expect(normalizeUrl('')).toBe('https://www.google.com');
  });

  it('keeps full http/https URLs unchanged', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('normalizes domain-like text to https URL', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
  });

  it('converts plain text to Google search URL', () => {
    expect(normalizeUrl('famous people')).toBe('https://www.google.com/search?q=famous%20people');
  });
});

describe('browserCore.boundTabCount', () => {
  it('applies min and max bounds', () => {
    expect(boundTabCount(0, 1, 10)).toBe(1);
    expect(boundTabCount(999, 1, 10)).toBe(10);
    expect(boundTabCount(4, 1, 10)).toBe(4);
  });
});

describe('browserCore.sanitizeNames', () => {
  it('trims and removes empty values', () => {
    expect(sanitizeNames([' Ada ', '', '  ', 'Bob'])).toEqual(['Ada', 'Bob']);
  });

  it('respects max items', () => {
    expect(sanitizeNames(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});
