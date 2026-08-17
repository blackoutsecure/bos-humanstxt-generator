/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Author resolution for the TEAM section.
 *
 * `auto` asks the configured AI provider to name the author from repository
 * signals, then falls back to a deterministic read of those same signals, so
 * the value stays stable when no provider (or no token) is available. An
 * explicit value from the action input or repository config always wins and
 * is never sent to a provider.
 */

const fs = require('fs');
const path = require('path');

const { detectProvider, chat } = require('./ai');

const AUTO_ALIAS = 'auto';
const DISABLED_ALIASES = ['', 'none', 'disabled', 'false', 'off'];

/** Authors are names, not sentences; anything longer is a model that rambled. */
const MAX_AUTHOR_LENGTH = 80;
const MAX_AUTHOR_WORDS = 8;

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'NOTICE', 'NOTICE.md'];
const COPYRIGHT_RE = /copyright\s*(?:\(c\)|©)?\s*\d{4}(?:\s*[-–—]\s*\d{4})?\s+(.+)/i;

/**
 * Normalise a candidate author into a single short display name.
 * @param {unknown} raw - Candidate value.
 * @returns {string} Sanitised name, or an empty string when implausible.
 */
function sanitizeAuthor(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = (raw.split(/\r?\n/)[0] || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`*_[(]+/, '')
    .replace(/[\s"'`*_\]).,;:]+$/, '')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length > MAX_AUTHOR_LENGTH) return '';
  if (cleaned.split(' ').length > MAX_AUTHOR_WORDS) return '';
  return cleaned;
}

function readText(root, relative) {
  try {
    return fs.readFileSync(path.resolve(root, relative), 'utf8');
  } catch {
    return '';
  }
}

/**
 * Read `author` from package.json, dropping any email/URL suffix.
 * @param {string} root - Repository root.
 * @returns {string} Author name, or an empty string.
 */
function packageAuthor(root) {
  const text = readText(root, 'package.json');
  if (!text) return '';
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return '';
  }
  const value = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  if (typeof value !== 'string') return '';
  return sanitizeAuthor(value.replace(/[<(].*?[>)]/g, ''));
}

/**
 * Read the copyright holder from the first LICENSE/NOTICE file that has one.
 * @param {string} root - Repository root.
 * @returns {string} Holder name, or an empty string.
 */
function copyrightHolder(root) {
  for (const name of LICENSE_FILES) {
    const text = readText(root, name);
    if (!text) continue;
    const match = COPYRIGHT_RE.exec(text);
    if (match) {
      const holder = sanitizeAuthor(match[1].replace(/\ball rights reserved\b.*/i, ''));
      if (holder) return holder;
    }
  }
  return '';
}

/**
 * Gather every signal that can identify the author of this repository.
 * @param {string} root - Repository root.
 * @param {object} environ - Environment map.
 * @returns {object} Signal bundle.
 */
function collectSignals(root, environ = process.env) {
  const env = environ || {};
  return {
    packageAuthor: packageAuthor(root),
    copyrightHolder: copyrightHolder(root),
    repoOwner: (
      env.GITHUB_REPOSITORY_OWNER ||
      (env.GITHUB_REPOSITORY || '').split('/')[0] ||
      ''
    ).trim(),
    readme: readText(root, 'README.md').slice(0, 600).trim(),
  };
}

/**
 * Pick an author from the signals without contacting a provider.
 * @param {object} signals - Bundle from `collectSignals`.
 * @returns {string} Author name, or an empty string.
 */
function deterministicAuthor(signals) {
  return (
    signals.packageAuthor || signals.copyrightHolder || sanitizeAuthor(signals.repoOwner) || ''
  );
}

function buildMessages(signals) {
  const evidence = [
    signals.packageAuthor ? `package.json author: ${signals.packageAuthor}` : '',
    signals.copyrightHolder ? `LICENSE/NOTICE copyright holder: ${signals.copyrightHolder}` : '',
    signals.repoOwner ? `GitHub repository owner: ${signals.repoOwner}` : '',
    signals.readme ? `README excerpt:\n${signals.readme}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    {
      role: 'system',
      content:
        'You identify the authoring person or organization of a software project. ' +
        'Reply with the name only.',
    },
    {
      role: 'user',
      content:
        'From the evidence below, give the single best display name for the author of ' +
        'this project, for the TEAM section of a humans.txt file.\n\n' +
        'Rules: output ONE line containing only the name. No quotes, markdown, labels, ' +
        'explanation, or trailing punctuation. Prefer the organization or person that ' +
        'owns the copyright. Do not invent a name that is absent from the evidence.\n\n' +
        `Evidence:\n${evidence}`,
    },
  ];
}

/**
 * Resolve the humans.txt author.
 *
 * @param {string} configured - `auto`, an explicit name, or a disabling alias.
 * @param {object} [options] - Resolution options.
 * @param {string} [options.root] - Repository root.
 * @param {object} [options.environ] - Environment map.
 * @param {string} [options.provider] - AI provider name for `auto`.
 * @param {number} [options.timeoutMs] - Provider request timeout.
 * @returns {Promise<{author: string, source: string}>} Resolved author.
 */
async function resolveAuthor(configured, options = {}) {
  const {
    root = process.cwd(),
    environ = process.env,
    provider = 'auto',
    timeoutMs = 20000,
  } = options;

  const requested = String(configured ?? '').trim();
  if (DISABLED_ALIASES.includes(requested.toLowerCase())) {
    return { author: '', source: 'disabled' };
  }
  // An operator-supplied name is authoritative and never leaves the runner.
  if (requested.toLowerCase() !== AUTO_ALIAS) {
    return { author: requested, source: 'explicit' };
  }

  const signals = collectSignals(root, environ);

  const descriptor = detectProvider(provider, environ);
  if (descriptor) {
    const answer = await chat(descriptor, buildMessages(signals), { timeoutMs, maxTokens: 32 });
    const candidate = sanitizeAuthor(answer);
    if (candidate) return { author: candidate, source: `ai:${descriptor.name}` };
  }

  const fallback = deterministicAuthor(signals);
  return fallback
    ? { author: fallback, source: 'repository-signals' }
    : { author: '', source: 'unresolved' };
}

module.exports = {
  AUTO_ALIAS,
  DISABLED_ALIASES,
  MAX_AUTHOR_LENGTH,
  sanitizeAuthor,
  packageAuthor,
  copyrightHolder,
  collectSignals,
  deterministicAuthor,
  resolveAuthor,
};
