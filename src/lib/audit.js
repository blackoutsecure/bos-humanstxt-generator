/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic humanstxt.org compliance audit.
 *
 * Every rule is driven by `humans_txt.audit.rules.<name>` in the layered
 * configuration. A rule configured as `skip` still emits a finding so the
 * report records that the control was deliberately not assessed rather
 * than silently dropped.
 */

const fs = require('fs');
const path = require('path');

const { Finding, AuditResult } = require('./findings');
const { parseHumansTxt, parseTeamEntries } = require('./humans-parser');

const MAX_EVIDENCE_SAMPLES = 5;

/** Case-insensitive markers that indicate unfilled template content. */
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\bchangeme\b/i,
  /\byour[- ]?(name|company|team|site)\b/i,
  /\bexample\.(com|org|net)\b/i,
  /\blorem ipsum\b/i,
  /<[^>]+>/,
];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const LAST_UPDATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;

/**
 * Run the full humanstxt.org audit against generated content.
 *
 * @param {object} options - Audit inputs.
 * @param {object} options.cfg - Resolved configuration.
 * @param {string} options.content - humans.txt content.
 * @param {string} options.filePath - Path the file was written to.
 * @param {string} [options.outputDir] - Published site directory.
 * @param {Date} [options.now] - Clock injection point for freshness checks.
 * @returns {AuditResult} Findings plus run context.
 */
function audit({ cfg, content, filePath, outputDir = '', now = new Date() }) {
  const rules = cfg.audit.rules;
  const findings = [];
  const location = filePath
    ? relativeTo(outputDir || process.cwd(), filePath)
    : cfg.generate.filename;

  /**
   * Evaluate one rule against a boolean outcome.
   * @param {string} ruleId - Rule identifier.
   * @param {string} ruleName - Config key under `audit.rules`.
   * @param {object} outcome - Evaluation outcome.
   * @param {boolean} outcome.ok - Whether the control is satisfied.
   * @param {string} outcome.passMessage - Evidence when satisfied.
   * @param {string} outcome.failMessage - Evidence when violated.
   * @param {object} [outcome.evidence] - Machine-readable evidence.
   */
  const evaluate = (ruleId, ruleName, outcome) => {
    const severity = rules[ruleName];
    if (severity === 'skip') {
      findings.push(
        new Finding({
          ruleId,
          severity: 'skip',
          message: `Control disabled via \`humans_txt.audit.rules.${ruleName}: skip\`.`,
          location,
          evidence: { rule: ruleName },
        }),
      );
      return;
    }
    findings.push(
      new Finding({
        ruleId,
        severity: outcome.ok ? 'pass' : severity,
        message: outcome.ok ? outcome.passMessage : outcome.failMessage,
        location,
        evidence: outcome.evidence || {},
      }),
    );
  };

  const parsed = parseHumansTxt(content || '');
  const teamLines = parsed.sections.TEAM || [];
  const thanksLines = parsed.sections.THANKS || [];
  const siteLines = parsed.sections.SITE || [];
  const teamEntries = parseTeamEntries(teamLines);

  // ── HM00x: sections ──────────────────────────────────────────────
  evaluate('HM001', 'require_team_section', {
    ok: teamLines.length > 0,
    passMessage: `TEAM section present with ${teamEntries.length} entr(y/ies).`,
    failMessage: 'No TEAM section found; humans.txt exists to credit people.',
    evidence: { team_entries: teamEntries.length },
  });

  evaluate('HM002', 'require_site_section', {
    ok: siteLines.length > 0,
    passMessage: `SITE section present with ${siteLines.length} field(s).`,
    failMessage: 'No SITE section found; the stack and last-update metadata are missing.',
    evidence: { site_fields: siteLines.length },
  });

  evaluate('HM003', 'require_thanks_section', {
    ok: thanksLines.length > 0,
    passMessage: `THANKS section present with ${thanksLines.length} line(s).`,
    failMessage: 'No THANKS section found.',
    evidence: { thanks_lines: thanksLines.length },
  });

  const withContact = teamEntries.filter((entry) => entry.contact);
  evaluate('HM004', 'require_team_contact', {
    ok: teamEntries.length > 0 && withContact.length > 0,
    passMessage: `${withContact.length} of ${teamEntries.length} team entr(y/ies) carry a contact.`,
    failMessage: teamEntries.length
      ? 'No team entry carries a Contact field.'
      : 'No team entries to check for a Contact field.',
    evidence: { with_contact: withContact.length, total: teamEntries.length },
  });

  // ── HM01x: content hygiene ───────────────────────────────────────
  // Only section content is audited; the generated banner comments are
  // tool output, not credits the operator controls.
  const body = contentLines(parsed);
  const urls = body.join('\n').match(URL_PATTERN) || [];
  const insecureUrls = urls.filter((url) => /^http:\/\//i.test(url));
  evaluate('HM010', 'require_https_urls', {
    ok: insecureUrls.length === 0,
    passMessage: urls.length ? `All ${urls.length} URL(s) use HTTPS.` : 'No URLs to check.',
    failMessage: `${insecureUrls.length} URL(s) use insecure http://.`,
    evidence: samples(insecureUrls),
  });

  const lastUpdate = fieldValue(siteLines, 'last update');
  evaluate('HM011', 'valid_last_update', {
    ok: Boolean(lastUpdate) && LAST_UPDATE_PATTERN.test(lastUpdate),
    passMessage: `Last update is a valid YYYY/MM/DD date (${lastUpdate}).`,
    failMessage: lastUpdate
      ? `Last update '${lastUpdate}' is not in YYYY/MM/DD form.`
      : 'No Last update field found in the SITE section.',
    evidence: { last_update: lastUpdate },
  });

  const ageDays = lastUpdateAgeDays(lastUpdate, now);
  evaluate('HM012', 'last_update_freshness', {
    ok: ageDays !== null && ageDays <= cfg.audit.maxAgeDays,
    passMessage: `Last update is ${ageDays} day(s) old, within the ${cfg.audit.maxAgeDays}-day window.`,
    failMessage:
      ageDays === null
        ? 'Last update is missing or unparseable, so freshness cannot be assessed.'
        : `Last update is ${ageDays} day(s) old, beyond the ${cfg.audit.maxAgeDays}-day window.`,
    evidence: { age_days: ageDays, max_age_days: cfg.audit.maxAgeDays },
  });

  const placeholders = body.filter((entry) =>
    PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(entry)),
  );
  evaluate('HM013', 'forbid_placeholder_values', {
    ok: placeholders.length === 0,
    passMessage: 'No placeholder or template values detected.',
    failMessage: `${placeholders.length} line(s) still contain placeholder text.`,
    evidence: samples(placeholders),
  });

  const emails = body.filter((entry) => EMAIL_PATTERN.test(entry));
  evaluate('HM014', 'forbid_email_addresses', {
    ok: emails.length === 0,
    passMessage: 'No plaintext email addresses published.',
    failMessage: `${emails.length} line(s) publish a plaintext email address.`,
    evidence: samples(emails),
  });

  const duplicateNames = findDuplicates(
    teamEntries.map((entry) => (entry.name || '').toLowerCase()).filter(Boolean),
  );
  evaluate('HM015', 'no_duplicate_team_entries', {
    ok: duplicateNames.length === 0,
    passMessage: 'No duplicate team entries.',
    failMessage: `${duplicateNames.length} team name(s) appear more than once.`,
    evidence: samples(duplicateNames),
  });

  // ── HM02x: file placement ────────────────────────────────────────
  const normalizedPath = (filePath || '').replace(/\\/g, '/');
  const atRoot = normalizedPath.endsWith(`/${cfg.generate.filename}`)
    ? path.posix.dirname(normalizedPath) === normalizePosix(outputDir)
    : normalizedPath === cfg.generate.filename;
  evaluate('HM020', 'site_root_location', {
    ok: atRoot,
    passMessage: `File is written to the site root as ${cfg.generate.filename}.`,
    failMessage: `File is written to ${normalizedPath || '(unknown)'}, not the site root.`,
    evidence: { path: normalizedPath, output_dir: outputDir },
  });

  const sizeBytes = Buffer.byteLength(content || '', 'utf8');
  const maxBytes = cfg.audit.maxSizeKb * 1024;
  evaluate('HM021', 'file_size_limit', {
    ok: sizeBytes <= maxBytes,
    passMessage: `File is ${sizeBytes} bytes, within the ${cfg.audit.maxSizeKb} KB limit.`,
    failMessage: `File is ${sizeBytes} bytes, beyond the ${cfg.audit.maxSizeKb} KB limit.`,
    evidence: { size_bytes: sizeBytes, max_bytes: maxBytes },
  });

  const linkedFrom = outputDir ? htmlFilesLinkingAuthor(outputDir) : [];
  evaluate('HM022', 'require_html_link', {
    ok: linkedFrom.length > 0,
    passMessage: `${linkedFrom.length} HTML page(s) declare <link rel="author">.`,
    failMessage: 'No HTML page declares <link rel="author" href="/humans.txt">.',
    evidence: samples(linkedFrom),
  });

  // ── HM03x: encoding ──────────────────────────────────────────────
  evaluate('HM030', 'require_utf8_no_bom', {
    ok: !parsed.hasBom,
    passMessage: 'File is UTF-8 encoded without a byte-order mark.',
    failMessage: 'File starts with a UTF-8 byte-order mark, which breaks the leading banner.',
    evidence: { has_bom: parsed.hasBom },
  });

  evaluate('HM031', 'valid_section_syntax', {
    ok: parsed.orphanLines.length === 0,
    passMessage: 'Every content line sits under a TEAM, THANKS, or SITE banner.',
    failMessage: `${parsed.orphanLines.length} content line(s) appear outside any section banner.`,
    evidence: { orphan_lines: parsed.orphanLines.slice(0, MAX_EVIDENCE_SAMPLES) },
  });

  return new AuditResult(findings, {
    file_path: normalizedPath,
    output_dir: outputDir,
    size_bytes: sizeBytes,
    team_entries: teamEntries.length,
    thanks_lines: thanksLines.length,
    site_fields: siteLines.length,
    last_update: lastUpdate,
  });
}

/**
 * Decide the process exit disposition for an audit result.
 * @param {AuditResult} result - Completed audit.
 * @param {string} failOn - Either `fail` or `never`.
 * @returns {boolean} True when the run should be marked failed.
 */
function shouldFail(result, failOn) {
  if (failOn === 'never') return false;
  return result.failed.length > 0 || result.errored.length > 0;
}

function contentLines(parsed) {
  return Object.values(parsed.sections).flat();
}

function fieldValue(lines, name) {
  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/);
    if (match && match[1].trim().toLowerCase() === name) return match[2].trim();
  }
  return '';
}

function lastUpdateAgeDays(value, now) {
  if (!value || !LAST_UPDATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value.replace(/\//g, '-')}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.round((now.getTime() - parsed.getTime()) / 86400000);
}

function findDuplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

function htmlFilesLinkingAuthor(dir) {
  const matches = [];
  const walk = (current, depth) => {
    if (depth > 4 || matches.length >= MAX_EVIDENCE_SAMPLES) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= MAX_EVIDENCE_SAMPLES) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full, depth + 1);
      } else if (/\.html?$/i.test(entry.name)) {
        try {
          const html = fs.readFileSync(full, 'utf8');
          if (/<link[^>]+rel=["']?author["']?[^>]*>/i.test(html)) {
            matches.push(path.relative(dir, full).replace(/\\/g, '/'));
          }
        } catch {
          // Unreadable file: not evidence either way.
        }
      }
    }
  };
  walk(dir, 0);
  return matches;
}

function normalizePosix(dir) {
  if (!dir) return '.';
  const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized || '.';
}

function relativeTo(baseDir, filePath) {
  const relative = path.relative(baseDir, filePath);
  const chosen = relative && !relative.startsWith('..') ? relative : filePath;
  return chosen.replace(/\\/g, '/');
}

function samples(values) {
  if (!values || !values.length) return {};
  return {
    samples: values.slice(0, MAX_EVIDENCE_SAMPLES),
    sample_truncated: values.length > MAX_EVIDENCE_SAMPLES,
    total: values.length,
  };
}

module.exports = {
  audit,
  shouldFail,
  PLACEHOLDER_PATTERNS,
  MAX_EVIDENCE_SAMPLES,
};
