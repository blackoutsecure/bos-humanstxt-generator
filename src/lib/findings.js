/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Finding model, severity semantics, and Markdown report rendering.
 *
 * Severities:
 *   pass  — control satisfied the configured policy
 *   warn  — review recommended, not a hard block on its own
 *   fail  — required control failed and should be remediated
 *   error — the audit itself could not complete for this control
 *   skip  — the control was disabled or lacked the evidence to assess
 */

const crypto = require('crypto');

const STANDARD = 'https://humanstxt.org/Standard.html';

/**
 * Rule family display order — drives the section banners in reports.
 * Entries are `[idPrefix, header, blurb]`.
 */
const RULE_FAMILIES = Object.freeze([
  ['HM00', 'Sections', 'TEAM, THANKS, and SITE coverage per humanstxt.org'],
  ['HM01', 'Content hygiene', 'URL scheme, dates, placeholders, and duplicates'],
  ['HM02', 'File placement', 'Site-root location, size, and HTML discoverability'],
  ['HM03', 'Encoding', 'UTF-8, byte-order marks, and section syntax'],
]);

const RULE_TITLES = Object.freeze({
  HM001: 'TEAM section present',
  HM002: 'SITE section present',
  HM003: 'THANKS section present',
  HM004: 'Team entries carry a contact',
  HM010: 'URLs use HTTPS',
  HM011: 'Last update is a valid date',
  HM012: 'Last update is recent',
  HM013: 'No placeholder values',
  HM014: 'No plaintext email addresses',
  HM015: 'No duplicate team entries',
  HM020: 'Served from the site root',
  HM021: 'File size within limits',
  HM022: 'Linked from HTML via rel="author"',
  HM030: 'UTF-8 encoded without a byte-order mark',
  HM031: 'Every content line sits under a section',
});

const RULE_HELP = Object.freeze({
  HM001: STANDARD,
  HM002: STANDARD,
  HM003: STANDARD,
  HM004: STANDARD,
  HM010: 'https://developers.google.com/search/docs/crawling-indexing/https',
  HM011: STANDARD,
  HM012: STANDARD,
  HM013: STANDARD,
  HM014: 'https://en.wikipedia.org/wiki/Email_address_harvesting',
  HM015: STANDARD,
  HM020: 'https://humanstxt.org/',
  HM021: 'https://humanstxt.org/',
  HM022: 'https://humanstxt.org/Standard.html',
  HM030: STANDARD,
  HM031: STANDARD,
});

const DEFAULT_REMEDIATIONS = Object.freeze({
  HM001:
    'Populate `humans_txt.fields.team` (or the `humans_team_*` inputs) so the file credits at least one person or team.',
  HM002:
    'Populate `humans_txt.fields.site` so the file records the stack, standards, and last update behind the site.',
  HM003:
    'Populate `humans_txt.fields.thanks` to credit the people, projects, or vendors the site depends on.',
  HM004:
    'Add a `contact` to at least one team entry so readers have a way to reach the people behind the site.',
  HM010:
    'Replace any http:// URL with its https:// equivalent so credits do not point at insecure endpoints.',
  HM011:
    'Write `Last update` as `YYYY/MM/DD` per the humanstxt.org standard, or omit it and let the action fill today.',
  HM012:
    'Refresh `Last update` on each publish — a stale date suggests the credits are no longer maintained.',
  HM013:
    'Replace the placeholder text with real values, or drop the field entirely rather than shipping a template.',
  HM014:
    'Obfuscate or replace the plaintext email with a contact form or handle to reduce address harvesting.',
  HM015:
    'De-duplicate the team entries — the same person listed twice is usually a config merge mistake.',
  HM020: 'Write humans.txt to the published site root; humanstxt.org expects it at `/humans.txt`.',
  HM021: 'Trim the file; an oversized humans.txt usually means templated or duplicated content.',
  HM022:
    'Add `<link rel="author" href="/humans.txt">` to your HTML head so the credits are discoverable.',
  HM030:
    'Write the file as UTF-8 without a byte-order mark so the leading `/* ... */` section parses cleanly.',
  HM031: 'Move stray content lines under a `/* TEAM */`, `/* THANKS */`, or `/* SITE */` banner.',
});

function defaultTitle(ruleId) {
  return RULE_TITLES[ruleId] || ruleId;
}

function defaultRemediation(ruleId, message) {
  return (
    DEFAULT_REMEDIATIONS[ruleId] ||
    message ||
    'Review the humans.txt configuration and apply the recommended control.'
  );
}

/** A single evidence-backed audit result. */
class Finding {
  /**
   * @param {object} options - Finding fields.
   * @param {string} options.ruleId - Stable rule identifier (e.g. `HM001`).
   * @param {string} options.severity - One of pass/warn/fail/error/skip.
   * @param {string} options.message - Evidence describing what was observed.
   * @param {string} [options.location] - File path or section name.
   * @param {string} [options.title] - Human-readable control name.
   * @param {object} [options.evidence] - Machine-readable evidence payload.
   * @param {string} [options.remediation] - Recommended remediation text.
   * @param {string} [options.source] - Emitting subsystem.
   */
  constructor({
    ruleId,
    severity,
    message,
    location = '',
    title = '',
    evidence = {},
    remediation = '',
    source = 'humanstxt-audit',
  }) {
    this.ruleId = ruleId;
    this.severity = severity;
    this.message = message;
    this.location = location;
    this.title = title || defaultTitle(ruleId);
    this.evidence = evidence || {};
    this.remediation = remediation || defaultRemediation(ruleId, message);
    this.remediationConfidence = 'deterministic';
    this.remediationSource = 'Blackout Secure Recommended Remediation';
    this.source = source;
    this.helpUri = RULE_HELP[ruleId] || STANDARD;
  }

  /** Identity that stays stable as recommendation wording changes. */
  get findingKey() {
    const identity = `${this.ruleId}|${this.location || '(humans.txt)'}`;
    const digest = crypto.createHash('sha256').update(identity, 'utf8').digest('hex').slice(0, 16);
    return `${this.ruleId.toLowerCase()}-${digest}`;
  }

  /** @returns {object} JSON-serialisable representation. */
  toJSON() {
    return {
      finding_key: this.findingKey,
      rule_id: this.ruleId,
      severity: this.severity,
      title: this.title,
      message: this.message,
      source: this.source,
      location: this.location,
      evidence: this.evidence,
      remediation: this.remediation,
      remediation_confidence: this.remediationConfidence,
      remediation_source: this.remediationSource,
      help_uri: this.helpUri,
    };
  }

  /** @returns {object} Machine-readable recommendation contract. */
  recommendation() {
    return {
      finding_key: this.findingKey,
      rule_id: this.ruleId,
      title: this.title,
      location: this.location,
      recommendation: this.remediation,
      confidence: this.remediationConfidence,
      source: this.remediationSource,
      patch_status: 'unavailable',
    };
  }
}

/** Aggregate of every finding emitted by one audit run. */
class AuditResult {
  /**
   * @param {Finding[]} [findings] - Findings in emission order.
   * @param {object} [context] - Run context echoed into reports.
   */
  constructor(findings = [], context = {}) {
    this.findings = findings;
    this.context = context;
  }

  get passed() {
    return this.findings.filter((f) => f.severity === 'pass');
  }

  get warned() {
    return this.findings.filter((f) => f.severity === 'warn');
  }

  get failed() {
    return this.findings.filter((f) => f.severity === 'fail');
  }

  get errored() {
    return this.findings.filter((f) => f.severity === 'error');
  }

  get skipped() {
    return this.findings.filter((f) => f.severity === 'skip');
  }

  /** @returns {object} Per-severity counts. */
  totals() {
    return {
      pass: this.passed.length,
      warn: this.warned.length,
      fail: this.failed.length,
      error: this.errored.length,
      skip: this.skipped.length,
    };
  }

  /** @returns {object[]} Recommendation contracts for non-pass findings. */
  recommendations() {
    return this.findings
      .filter((f) => f.severity !== 'pass' && f.remediation.trim())
      .map((f) => f.recommendation());
  }

  /** @returns {object} Full JSON report payload. */
  toJSON() {
    return {
      schema_version: 1,
      context: this.context,
      totals: this.totals(),
      verdict: verdict(this.totals())[0],
      findings: this.findings.map((f) => f.toJSON()),
      recommendations: this.recommendations(),
    };
  }

  /** @returns {string} GitHub-flavoured Markdown audit report. */
  summaryMarkdown() {
    return renderMarkdown(this);
  }
}

function verdict(totals) {
  if (totals.error) {
    return [
      'Inconclusive',
      'One or more controls could not be evaluated. Re-run after resolving the audit errors below.',
    ];
  }
  if (totals.fail) {
    return [
      'Action required',
      'At least one required humans.txt control failed and should be remediated before release.',
    ];
  }
  if (totals.warn) {
    return [
      'Review recommended',
      'No blocking failures. The warnings below are worth reviewing before release.',
    ];
  }
  if (totals.pass) {
    return ['Pass', 'Every configured humans.txt control satisfied its policy.'];
  }
  return ['Not assessed', 'No controls produced an assessable result for this run.'];
}

function severityLabel(severity) {
  switch (severity) {
    case 'pass':
      return '✅ Pass';
    case 'warn':
      return '⚠️ Warning';
    case 'fail':
      return '🔴 High';
    case 'error':
      return '🔥 Critical';
    default:
      return '⚪ Not Assessed';
  }
}

function mdEscape(text) {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function familyFor(ruleId) {
  return RULE_FAMILIES.findIndex(([prefix]) => ruleId.startsWith(prefix));
}

function recommendedActions(totals) {
  const actions = [];
  if (totals.fail) {
    actions.push('Remediate every 🔴 High finding — these are required controls that failed.');
  }
  if (totals.error) {
    actions.push(
      'Investigate every 🔥 Critical finding — the audit could not collect evidence for those controls.',
    );
  }
  if (totals.warn) {
    actions.push(
      'Triage the ⚠️ Warning findings and either remediate them or set the rule to `skip` in config once accepted.',
    );
  }
  if (totals.skip) {
    actions.push(
      'Review ⚪ Not Assessed controls — enable them in `humans_txt.audit.rules` when they are relevant.',
    );
  }
  if (!actions.length) {
    actions.push('No action required. Keep the audit wired into CI to catch regressions.');
  }
  return actions;
}

function renderMarkdown(result) {
  const totals = result.totals();
  const [headline, detail] = verdict(totals);
  const ctx = result.context || {};

  const lines = [
    '# Blackout Secure Humans TXT Generator Audit Report',
    '',
    '**Provided by [Blackout Secure](https://blackoutsecure.app)**',
    '',
    '## Summary',
    '',
    `**Verdict:** ${mdEscape(headline)}`,
    '',
    detail,
    '',
    `**Totals:** ✅ ${totals.pass} pass · ⚠️ ${totals.warn} warning · ` +
      `🔴 ${totals.fail} high · 🔥 ${totals.error} critical · ` +
      `⚪ ${totals.skip} not assessed`,
    '',
    '| Severity | Count | Meaning |',
    '| -------- | ----- | ------- |',
    `| ✅ Pass | ${totals.pass} | Control satisfied the configured policy. |`,
    `| ⚠️ Warning | ${totals.warn} | Review recommended; not usually a hard block by itself. |`,
    `| 🔴 High | ${totals.fail} | Required control failed and should be remediated. |`,
    `| 🔥 Critical | ${totals.error} | Audit execution or evidence collection error. |`,
    `| ⚪ Not Assessed | ${totals.skip} | Check was skipped or lacked sufficient evidence. |`,
    '',
  ];

  if (Object.keys(ctx).length) {
    lines.push('## Run Context', '');
    lines.push('| Field | Value |', '| ----- | ----- |');
    for (const [key, value] of Object.entries(ctx)) {
      lines.push(`| ${mdEscape(key)} | ${mdEscape(value)} |`);
    }
    lines.push('');
  }

  lines.push('## Recommended Actions', '');
  for (const action of recommendedActions(totals)) {
    lines.push(`- ${action}`);
  }
  lines.push('');

  lines.push(
    '## Scope and Methodology',
    '',
    'This automated audit reviews the generated humans.txt against the humanstxt.org standard — section coverage, contact reachability, URL hygiene, freshness, placeholder detection, file placement, and encoding. Results are evidence-based at run time and are intended to support release and site-governance review.',
    '',
  );

  const recommendations = result.findings.filter(
    (f) => f.severity !== 'pass' && f.remediation.trim(),
  );
  lines.push(
    '## Recommendations',
    '',
    '| Finding Key | Rule | Assessment | Location | Evidence / Why | Recommended Action |',
    '| ----------- | ---- | ---------- | -------- | -------------- | ------------------ |',
  );
  if (recommendations.length) {
    for (const f of recommendations) {
      lines.push(
        `| \`${f.findingKey}\` | \`${f.ruleId}\` | ${severityLabel(f.severity)} | ` +
          `${mdEscape(f.location || '—')} | ${mdEscape(f.message)} | ${mdEscape(f.remediation)} |`,
      );
    }
  } else {
    lines.push('| — | — | — | — | — | — |');
  }
  lines.push('');

  if (!result.findings.length) {
    lines.push(
      '## Detailed Findings',
      '',
      '_No findings were emitted by the configured audit controls._',
      '',
    );
    return `${lines.join('\n')}\n`;
  }

  const buckets = new Map();
  for (const f of result.findings) {
    const idx = familyFor(f.ruleId);
    if (!buckets.has(idx)) buckets.set(idx, []);
    buckets.get(idx).push(f);
  }

  lines.push('## Detailed Findings', '');
  for (const idx of [...RULE_FAMILIES.map((_, i) => i), -1]) {
    const rows = buckets.get(idx);
    if (!rows || !rows.length) continue;
    const [, header, blurb] =
      idx === -1 ? ['', 'Other', 'Uncategorised controls'] : RULE_FAMILIES[idx];
    lines.push(`### ${header}`, `_${blurb}_`, '');

    const attention = rows.filter((f) => f.severity !== 'pass');
    const passed = rows.filter((f) => f.severity === 'pass');

    if (attention.length) {
      lines.push(
        '#### Findings Requiring Attention',
        '',
        '| Rule | Severity | Location | Control | Evidence | Recommended Remediation |',
        '| ---- | -------- | -------- | ------- | -------- | ----------------------- |',
      );
      for (const f of attention) {
        lines.push(
          `| \`${f.ruleId}\` | ${severityLabel(f.severity)} | ${mdEscape(f.location || '—')} | ` +
            `${mdEscape(f.title)} | ${mdEscape(f.message)} | ${mdEscape(f.remediation)} |`,
        );
      }
      lines.push('');
    }

    if (passed.length) {
      lines.push(
        '#### Passed Controls',
        '',
        '| Rule | Severity | Location | Control | Evidence |',
        '| ---- | -------- | -------- | ------- | -------- |',
      );
      for (const f of passed) {
        lines.push(
          `| \`${f.ruleId}\` | ${severityLabel(f.severity)} | ${mdEscape(f.location || '—')} | ` +
            `${mdEscape(f.title)} | ${mdEscape(f.message)} |`,
        );
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  Finding,
  AuditResult,
  RULE_FAMILIES,
  RULE_TITLES,
  RULE_HELP,
  DEFAULT_REMEDIATIONS,
  severityLabel,
  verdict,
  mdEscape,
  familyFor,
};
