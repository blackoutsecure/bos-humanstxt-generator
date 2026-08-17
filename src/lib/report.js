/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reporting surfaces: console table, GitHub step summary, and the JSON
 * report / recommendations sidecars consumed by downstream automation.
 */

const fs = require('fs');
const path = require('path');

const { RULE_FAMILIES, familyFor, severityLabel } = require('./findings');

const SEVERITY_ICON = Object.freeze({
  pass: '✅',
  warn: '⚠️',
  fail: '🔴',
  error: '🔥',
  skip: '⚪',
});

/**
 * Print the grouped audit table to the Actions log.
 * @param {object} core - `@actions/core` module.
 * @param {object} result - An `AuditResult`.
 */
function printAuditTable(core, result) {
  core.info('');
  core.info('👥 humans.txt Audit:');

  if (!result.findings.length) {
    core.info('   • audit produced no findings');
    return;
  }

  const buckets = new Map();
  for (const finding of result.findings) {
    const idx = familyFor(finding.ruleId);
    if (!buckets.has(idx)) buckets.set(idx, []);
    buckets.get(idx).push(finding);
  }

  const idWidth = Math.max(...result.findings.map((f) => f.ruleId.length));
  const sevWidth = Math.max(...result.findings.map((f) => f.severity.length));

  const emit = (finding) => {
    const icon = SEVERITY_ICON[finding.severity] || '•';
    core.info(
      `      ${icon} ${finding.ruleId.padEnd(idWidth)}  ` +
        `${finding.severity.padEnd(sevWidth)}  ${finding.message}`,
    );
  };

  for (const [idx, [, header, blurb]] of RULE_FAMILIES.entries()) {
    const rows = buckets.get(idx);
    if (!rows || !rows.length) continue;
    core.info('');
    core.info(`   ━━ ${header} — ${blurb}`);
    rows.forEach(emit);
  }

  const misc = buckets.get(-1);
  if (misc && misc.length) {
    core.info('');
    core.info('   ━━ Other');
    misc.forEach(emit);
  }

  const totals = result.totals();
  core.info('');
  core.info('   ━━ Summary');
  core.info(
    `      ✅ ${totals.pass} pass  ⚠️ ${totals.warn} warn  🔴 ${totals.fail} fail  ` +
      `🔥 ${totals.error} error  ⚪ ${totals.skip} skip`,
  );
  if (totals.skip) {
    core.info(
      '      skip = the control was disabled in `humans_txt.audit.rules` or lacked evidence to assess.',
    );
  }
}

/**
 * Route findings into Actions annotations honouring the configured severity.
 * @param {object} core - `@actions/core` module.
 * @param {object} result - An `AuditResult`.
 * @param {boolean} failRun - Whether `fail` findings should fail the job.
 */
function annotate(core, result, failRun) {
  for (const finding of result.findings) {
    const text = `${finding.ruleId}: ${finding.message}`;
    if (finding.severity === 'fail' || finding.severity === 'error') {
      if (failRun) core.setFailed(text);
      else core.error(text);
    } else if (finding.severity === 'warn') {
      core.warning(text);
    }
  }
}

/**
 * Append the Markdown audit report to `$GITHUB_STEP_SUMMARY`.
 * @param {object} result - An `AuditResult`.
 * @param {object} [options] - Rendering options.
 * @param {string} [options.aiSummary] - Optional AI/heuristic summary text.
 * @param {string} [options.aiProvider] - Provider that produced the summary.
 * @param {object} [options.environ] - Environment map.
 * @returns {boolean} True when a summary was written.
 */
function writeStepSummary(result, options = {}) {
  const { aiSummary = '', aiProvider = '', environ = process.env } = options;
  const summaryPath = environ.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return false;

  let markdown = result.summaryMarkdown();
  if (aiSummary) {
    markdown += [
      '',
      '## Findings Summary',
      '',
      `_Source: ${aiProvider || 'local-heuristic'}_`,
      '',
      aiSummary,
      '',
    ].join('\n');
  }

  try {
    fs.appendFileSync(summaryPath, markdown, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Write the machine-readable JSON report.
 * @param {object} result - An `AuditResult`.
 * @param {string} filePath - Destination path.
 * @param {object} [extra] - Extra top-level fields to merge in.
 * @returns {string} The path written.
 */
function writeJsonReport(result, filePath, extra = {}) {
  return writeJson(filePath, { ...result.toJSON(), ...extra });
}

/**
 * Write the recommendations sidecar for non-pass findings.
 * @param {object} result - An `AuditResult`.
 * @param {string} filePath - Destination path.
 * @returns {string} The path written.
 */
function writeRecommendations(result, filePath) {
  return writeJson(filePath, result.recommendations());
}

/**
 * Write the skipped-controls sidecar. SARIF drops `skip` findings, so this
 * is the only machine-readable record that a control went unassessed.
 * @param {object} result - An `AuditResult`.
 * @param {string} filePath - Destination path.
 * @returns {string} The path written.
 */
function writeSkips(result, filePath) {
  return writeJson(
    filePath,
    result.skipped.map((f) => ({
      rule_id: f.ruleId,
      title: f.title,
      message: f.message,
      location: f.location,
    })),
  );
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = {
  SEVERITY_ICON,
  severityLabel,
  printAuditTable,
  annotate,
  writeStepSummary,
  writeJsonReport,
  writeRecommendations,
  writeSkips,
};
