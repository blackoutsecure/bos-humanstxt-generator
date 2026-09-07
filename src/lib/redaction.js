// Blackout Secure Humans TXT Generator
// SPDX-License-Identifier: Apache-2.0
// Redacts credential-shaped values only at reporting boundaries.

const BUILTIN_PATTERNS = Object.freeze([
  /\b(?:ghp|gho|ghs|ghr|ghu)_[A-Za-z0-9_]+\b/g,
  /\bgithub_pat_[A-Za-z0-9_]+\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /(https?:\/\/[^/\s:@]+:)[^@\s]+(@)/gi,
  /\b(Bearer|Basic)\s+[A-Za-z0-9+/_=-]{8,}/gi,
  /(\b(?:password|token|api_key|secret|private_key)\b\s*[:=]\s*)(["']?)[^\s,;}\]]+\2/gi,
]);

function patterns(extraPatterns = []) {
  return [...BUILTIN_PATTERNS, ...extraPatterns.map((pattern) => new RegExp(pattern, 'g'))];
}

/**
 * Redact credential-shaped values in a string while preserving surrounding context.
 * @param {unknown} value - Value to redact.
 * @param {object} [options] - Redaction options.
 * @returns {unknown} Redacted value.
 */
function redactSensitive(value, options = {}) {
  if (typeof value !== 'string' || options.enabled === false) return value;
  const placeholder = options.placeholder || '***';
  return patterns(options.extraPatterns || []).reduce(
    (result, pattern) =>
      result.replace(pattern, (match) => {
        if (/^https?:\/\//i.test(match)) return match.replace(/:[^@]+@/, `:${placeholder}@`);
        if (/^(?:password|token|api_key|secret|private_key)\b/i.test(match)) {
          return match.replace(/([:=]\s*).*/, `$1${placeholder}`);
        }
        if (/^(?:Bearer|Basic)\s/i.test(match)) return match.replace(/\s+.*/, ` ${placeholder}`);
        return placeholder;
      }),
    value,
  );
}

/**
 * Redact strings recursively in a report payload without changing keys or structure.
 * @param {unknown} value - Report payload.
 * @param {object} [options] - Redaction options.
 * @returns {unknown} Redacted payload.
 */
function redactObject(value, options = {}) {
  if (Array.isArray(value)) return value.map((item) => redactObject(item, options));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactObject(item, options)]),
    );
  }
  return redactSensitive(value, options);
}

module.exports = { redactSensitive, redactObject };
