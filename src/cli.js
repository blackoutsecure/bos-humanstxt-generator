#!/usr/bin/env node
/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLI companion to the Action.
 *
 * Subcommands:
 *   version   Print the package version.
 *   validate  Resolve layered configuration and print the result.
 *   generate  Write humans.txt from the resolved configuration.
 *   audit     Audit an existing humans.txt against humanstxt.org.
 *   sarif     Merge SARIF files into one log ready for GHAS upload.
 *
 * The Action and the CLI share the same modules, so a local dry-run
 * produces byte-identical reports to a CI run.
 */

const fs = require('fs');
const path = require('path');

const cfgMod = require('./lib/config');
const metadataMod = require('./lib/metadata');
const auditMod = require('./lib/audit');
const sarifMod = require('./lib/sarif');
const reportMod = require('./lib/report');
const aiMod = require('./lib/ai');
const { buildHumansTxt } = require('./lib/humans-parser');

const USAGE = `bos-humanstxt <command> [options]

Commands:
  version                       Print the package version.
  validate                      Resolve and validate layered configuration.
  generate                      Write humans.txt from the resolved config.
  audit                         Audit an existing humans.txt.
  sarif                         Merge SARIF files into one log.

Common options:
  --root <dir>                  Repository root (default: cwd).
  --config <path>               Explicit repository config path.
  --global-config <path>        Global config path (default: ${cfgMod.DEFAULT_GLOBAL_CONFIG_PATH}).
  --use-global-config           Require the global config tier.
  --no-global-config            Disable global config discovery.
  --no-marketplace-config       Skip the bundled marketplace baseline.

generate options:
  --output-dir <dir>            Output directory (default: from config).

audit options:
  --file <path>                 humans.txt to audit.
  --output-dir <dir>            Directory holding humans.txt.
  --sarif <path>                Write audit findings as SARIF.
  --json <path>                 Write the machine-readable JSON report.
  --recommendations <path>      Write the recommendations sidecar.
  --skips <path>                Write the skipped-controls sidecar.
  --fail-on <fail|never>        Override the configured exit policy.
  --no-ai                       Disable the AI findings summary.

sarif options:
  --input <path>                SARIF file to merge (repeatable).
  --output <path>               Destination path (required).
`;

/**
 * Parse argv into a flag map plus repeated arguments.
 * @param {string[]} argv - Raw arguments (without node/script).
 * @returns {{command: string, flags: object, repeated: object}} Parsed args.
 */
function parseArgs(argv) {
  const flags = {};
  const repeated = { input: [] };
  const [command = '', ...rest] = argv;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);

    if (key === 'use-global-config') {
      flags.useGlobalConfig = true;
      continue;
    }
    if (key === 'no-global-config') {
      flags.useGlobalConfig = false;
      continue;
    }
    if (key === 'no-marketplace-config') {
      flags.useMarketplaceConfig = false;
      continue;
    }
    if (key === 'no-ai') {
      flags.noAi = true;
      continue;
    }
    if (key === 'help') {
      flags.help = true;
      continue;
    }

    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`option --${key} requires a value`);
    }
    i += 1;
    if (key === 'input') repeated.input.push(value);
    else flags[camel(key)] = value;
  }

  return { command, flags, repeated };
}

function camel(key) {
  return key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function resolveConfig(flags) {
  return cfgMod.resolve(flags.root || '.', {
    configPath: flags.config || '',
    globalConfigPath: flags.globalConfig || cfgMod.DEFAULT_GLOBAL_CONFIG_PATH,
    useGlobalConfig: flags.useGlobalConfig === undefined ? null : flags.useGlobalConfig,
    useMarketplaceConfig: flags.useMarketplaceConfig !== false,
    repoName: (process.env.GITHUB_REPOSITORY || '').split('/')[1] || '',
  });
}

function cmdVersion() {
  process.stdout.write(`${metadataMod.packageMetadata().version}\n`);
  return 0;
}

function cmdValidate(flags) {
  const pkg = metadataMod.packageMetadata();
  const cfg = resolveConfig(flags);

  const out = [
    'Package metadata:',
    `  name:        ${pkg.name}`,
    `  version:     ${pkg.version}`,
    `  author:      ${pkg.author}`,
    `  description: ${pkg.description}`,
    'Config cascade:',
    ...cfg.sourcePaths.map((source) => `  - ${source}`),
    `owner:        ${cfg.owner || '(unset)'}`,
    `project_name: ${cfg.projectName || '(unset)'}`,
    `email:        ${cfg.email || '(unset)'}`,
    `generate:     comments=${cfg.generate.includeComments} file=${cfg.generate.filename} dir=${cfg.generate.outputDir}`,
    `fields:       team=${cfg.fields.team.length} thanks=${cfg.fields.thanks.length} site=${Object.keys(cfg.fields.site).length}`,
    `audit:        enable=${cfg.audit.enable} fail_on=${cfg.audit.failOn} max_size_kb=${cfg.audit.maxSizeKb} max_age_days=${cfg.audit.maxAgeDays}`,
    `reporting:    step_summary=${cfg.reporting.stepSummary} sarif=${cfg.reporting.sarif} json=${cfg.reporting.jsonReport} recommendations=${cfg.reporting.recommendations}`,
    `remediation:  ai=${cfg.remediation.enableAiFindingsSummary} provider=${cfg.remediation.aiFindingsSummaryProvider} fallback=${cfg.remediation.localHeuristicFallback}`,
    'audit rules:',
    ...Object.entries(cfg.audit.rules).map(
      ([name, severity]) => `  ${name.padEnd(28)} ${severity}`,
    ),
  ];
  process.stdout.write(`${out.join('\n')}\n`);
  return 0;
}

/**
 * Build humans.txt content from the resolved configuration.
 * @param {object} cfg - Resolved configuration.
 * @returns {string} humans.txt content.
 */
function contentFromConfig(cfg) {
  const content = buildHumansTxt({
    team: [...cfg.fields.team],
    thanks: [...cfg.fields.thanks],
    site: { ...cfg.fields.site },
    includeComments: cfg.generate.includeComments,
  });
  if (!content) {
    throw new Error(
      'no humans.txt content configured — populate `humans_txt.fields` or enable comments',
    );
  }
  return content;
}

function cmdGenerate(flags) {
  const root = path.resolve(flags.root || '.');
  const cfg = resolveConfig(flags);
  const outputDir = path.resolve(root, flags.outputDir || cfg.generate.outputDir);
  const content = contentFromConfig(cfg);

  const target = path.join(outputDir, cfg.generate.filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  process.stderr.write(`wrote ${target}\n`);
  return 0;
}

async function cmdAudit(flags) {
  const root = path.resolve(flags.root || '.');
  const cfg = resolveConfig(flags);

  const outputDir = path.resolve(root, flags.outputDir || cfg.generate.outputDir);
  const filePath = flags.file
    ? path.resolve(root, flags.file)
    : path.join(outputDir, cfg.generate.filename);

  if (!fs.existsSync(filePath)) {
    process.stderr.write(`error: humans.txt not found: ${filePath}\n`);
    return 2;
  }

  const result = auditMod.audit({
    cfg,
    content: fs.readFileSync(filePath, 'utf8'),
    filePath,
    outputDir,
  });

  reportMod.printAuditTable(consoleCore(), result);

  const summary = flags.noAi
    ? { text: aiMod.localSummary(result), provider: 'local-heuristic' }
    : await aiMod.buildSummary(result, cfg.remediation);
  if (summary.text) {
    process.stdout.write(`\nFindings summary (${summary.provider}):\n${summary.text}\n`);
  }

  if (flags.sarif) {
    sarifMod.dump(
      sarifMod.merge({ runs: [sarifMod.auditRun(result.findings, { baseDir: root })] }),
      flags.sarif,
    );
    process.stderr.write(`wrote SARIF: ${flags.sarif}\n`);
  }
  if (flags.json) {
    reportMod.writeJsonReport(result, flags.json, {
      ai_summary: summary.text,
      ai_provider: summary.provider,
    });
    process.stderr.write(`wrote JSON report: ${flags.json}\n`);
  }
  if (flags.recommendations) {
    reportMod.writeRecommendations(result, flags.recommendations);
    process.stderr.write(`wrote recommendations: ${flags.recommendations}\n`);
  }
  if (flags.skips) {
    reportMod.writeSkips(result, flags.skips);
    process.stderr.write(`wrote skips: ${flags.skips}\n`);
  }
  reportMod.writeStepSummary(result, {
    aiSummary: summary.text,
    aiProvider: summary.provider,
  });

  const failOn = flags.failOn || cfg.audit.failOn;
  if (!cfgMod.FAIL_ON_LEVELS.includes(failOn)) {
    process.stderr.write(`error: --fail-on must be one of ${cfgMod.FAIL_ON_LEVELS.join(', ')}\n`);
    return 2;
  }
  return auditMod.shouldFail(result, failOn) ? 1 : 0;
}

function cmdSarif(flags, repeated) {
  if (!flags.output) {
    process.stderr.write('error: --output is required\n');
    return 2;
  }
  const logs = [];
  for (const input of repeated.input) {
    if (!fs.existsSync(input)) {
      process.stderr.write(`note: skipping missing SARIF input: ${input}\n`);
      continue;
    }
    logs.push(sarifMod.load(input));
  }
  const merged = sarifMod.merge(...logs);
  sarifMod.dump(merged, flags.output);
  process.stderr.write(
    `wrote merged SARIF: ${flags.output} (${merged.runs.length} run(s), ${logs.length} input(s))\n`,
  );
  return 0;
}

/** Minimal `@actions/core`-shaped logger for CLI use. */
function consoleCore() {
  return {
    info: (msg) => process.stdout.write(`${msg}\n`),
    warning: (msg) => process.stderr.write(`warning: ${msg}\n`),
    error: (msg) => process.stderr.write(`error: ${msg}\n`),
    debug: () => {},
    setFailed: (msg) => process.stderr.write(`error: ${msg}\n`),
  };
}

/**
 * CLI entry point.
 * @param {string[]} [argv] - Arguments without node/script.
 * @returns {Promise<number>} Process exit code.
 */
async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 2;
  }

  const { command, flags, repeated } = parsed;
  if (!command || flags.help || command === 'help') {
    process.stdout.write(USAGE);
    return command && command !== 'help' ? 2 : 0;
  }

  try {
    switch (command) {
      case 'version':
        return cmdVersion();
      case 'validate':
        return cmdValidate(flags);
      case 'generate':
        return cmdGenerate(flags);
      case 'audit':
        return await cmdAudit(flags);
      case 'sarif':
        return cmdSarif(flags, repeated);
      default:
        process.stderr.write(`error: unknown command '${command}'\n\n${USAGE}`);
        return 2;
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 2;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { main, parseArgs, contentFromConfig, USAGE };
