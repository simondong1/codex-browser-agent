const DEFAULT_HOME = 'https://www.google.com';

function normalizeUrl(input) {
  if (!input) return DEFAULT_HOME;
  const value = String(input).trim();
  if (!value) return DEFAULT_HOME;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes('.') || value.includes('localhost')) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function boundTabCount(count, min = 1, max = 50) {
  const n = Number(count);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function sanitizeNames(names, max = 25) {
  if (!Array.isArray(names)) return [];
  return names
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

module.exports = {
  DEFAULT_HOME,
  normalizeUrl,
  boundTabCount,
  sanitizeNames
};
