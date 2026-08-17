/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * SARIF 2.1.0 emission for GitHub code scanning upload.
 *
 * `skip` findings are intentionally dropped from SARIF — they represent
 * controls that were never assessed and would otherwise clutter the
 * Security tab. Callers that need them consume the JSON report instead.
 */

const fs = require('fs');
const path = require('path');

const { PROJECT_CONFIG } = require('./project-config');

const SARIF_VERSION = '2.1.0';
const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
const TOOL_NAME = 'BOS Humans TXT Generator';

/** Map an internal severity onto a SARIF result level. */
const LEVEL_BY_SEVERITY = Object.freeze({
  fail: 'error',
  error: 'error',
  warn: 'warning',
  pass: 'none',
});

/**
 * Build a SARIF run from audit findings.
 * @param {Array<object>} findings - Finding instances.
 * @param {object} [options] - Run options.
 * @param {string} [options.baseDir] - Directory used to relativise locations.
 * @returns {object} A SARIF run object.
 */
function auditRun(findings, options = {}) {
  const { baseDir = process.cwd() } = options;
  const reportable = findings.filter((f) => f.severity !== 'skip');

  const ruleIndex = new Map();
  const rules = [];
  for (const finding of reportable) {
    if (ruleIndex.has(finding.ruleId)) continue;
    ruleIndex.set(finding.ruleId, rules.length);
    rules.push({
      id: finding.ruleId,
      name: finding.ruleId,
      shortDescription: { text: finding.title },
      fullDescription: { text: finding.remediation },
      helpUri: finding.helpUri,
      help: { text: finding.remediation, markdown: finding.remediation },
      defaultConfiguration: { level: LEVEL_BY_SEVERITY[finding.severity] || 'note' },
      properties: { tags: ['humans-txt', 'site-metadata', 'blackout-secure'] },
    });
  }

  const results = reportable.map((finding) => ({
    ruleId: finding.ruleId,
    ruleIndex: ruleIndex.get(finding.ruleId),
    level: LEVEL_BY_SEVERITY[finding.severity] || 'note',
    message: { text: finding.message },
    partialFingerprints: { bosHumansTxtFindingKey: finding.findingKey },
    properties: {
      severity: finding.severity,
      remediation: finding.remediation,
      remediation_source: finding.remediationSource,
    },
    locations: [locationFor(finding, baseDir)],
  }));

  return {
    tool: {
      driver: {
        name: TOOL_NAME,
        version: PROJECT_CONFIG.version,
        informationUri: `https://${PROJECT_CONFIG.repository.url}`,
        rules,
      },
    },
    results,
  };
}

function locationFor(finding, baseDir) {
  const location = finding.location || '';
  const isFilePath = location && !/^[a-z][a-z0-9+.-]*:\/\//i.test(location);
  let uri = 'README.md';
  if (isFilePath) {
    const relative = path.relative(baseDir, path.resolve(baseDir, location));
    uri = relative && !relative.startsWith('..') ? relative : location;
  }
  return {
    physicalLocation: {
      artifactLocation: { uri: uri.replace(/\\/g, '/'), uriBaseId: '%SRCROOT%' },
      region: { startLine: 1 },
    },
    ...(isFilePath ? {} : { properties: { url: location } }),
  };
}

/**
 * Merge SARIF logs into a single log.
 * @param {...object} logs - SARIF log objects.
 * @returns {object} Merged SARIF log.
 */
function merge(...logs) {
  const runs = [];
  for (const log of logs) {
    if (!log) continue;
    if (Array.isArray(log.runs)) runs.push(...log.runs);
  }
  return { $schema: SARIF_SCHEMA, version: SARIF_VERSION, runs };
}

/**
 * Read a SARIF log from disk.
 * @param {string} filePath - Path to the SARIF file.
 * @returns {object} Parsed SARIF log.
 */
function load(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`invalid SARIF file ${filePath}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.runs)) {
    throw new Error(`invalid SARIF file ${filePath}: missing \`runs\` array`);
  }
  return parsed;
}

/**
 * Write a SARIF log to disk, creating parent directories as needed.
 * @param {object} log - SARIF log object.
 * @param {string} filePath - Destination path.
 * @returns {string} The path written.
 */
function dump(log, filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = {
  SARIF_VERSION,
  SARIF_SCHEMA,
  TOOL_NAME,
  LEVEL_BY_SEVERITY,
  auditRun,
  merge,
  load,
  dump,
};
