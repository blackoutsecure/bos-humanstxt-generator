/**
 * Copyright 2025 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 */

const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

const { buildHumansTxt, parseHumansConfig } = require('./lib/humans-parser');
const {
  printHeader,
  printFooter,
  printConfigHeader,
  printConfigSection,
  printHumansSection,
  printHumansValidation,
} = require('./lib/output-formatter');
const cfgMod = require('./lib/config');
const auditMod = require('./lib/audit');
const sarifMod = require('./lib/sarif');
const reportMod = require('./lib/report');
const aiMod = require('./lib/ai');
const authorMod = require('./lib/author');
const { packageMetadata } = require('./lib/metadata');

function parseBoolean(input, defaultValue) {
  // `core.getInput` returns '' for an unset input, so an empty string must
  // fall through to the default rather than reading as `false`.
  const raw = input === undefined || input === null ? '' : String(input).trim();
  if (raw === '') return /^true$/i.test(String(defaultValue || 'false'));
  return /^true$/i.test(raw);
}

/**
 * Read a boolean action input, falling back to the layered config value.
 * @param {string} name - Action input name.
 * @param {boolean} fallback - Config-derived default.
 * @returns {boolean} Resolved boolean.
 */
function boolInput(name, fallback) {
  const raw = (core.getInput(name) || '').trim();
  if (!raw) return fallback;
  return /^true$/i.test(raw);
}

/**
 * Resolve the tri-state `use_global_config` input.
 * @returns {boolean|null} true = require, false = disable, null = auto.
 */
function globalConfigMode() {
  const raw = (core.getInput('use_global_config') || 'auto').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function resolveDate(input) {
  return input || new Date().toISOString().split('T')[0].replace(/-/g, '/');
}

/**
 * Merge the single-entry action inputs with the configured entry lists.
 *
 * Action inputs describe one person, so they are prepended to whatever the
 * config tiers already declared rather than replacing the whole roster.
 *
 * @param {object} inputEntry - Entry built from action inputs.
 * @param {ReadonlyArray<object>} configured - Entries from config.
 * @returns {object[]} Combined entries.
 */
function mergeEntries(inputEntry, configured) {
  const hasInput = Object.keys(inputEntry).length > 0;
  return hasInput ? [inputEntry, ...configured] : [...configured];
}

async function run() {
  try {
    printHeader(core);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Layered configuration
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Precedence: action input (when set) > repository config > global
    // config > bundled marketplace baseline > built-in default.
    let cfg;
    try {
      cfg = cfgMod.resolve(process.cwd(), {
        configPath: core.getInput('config_path') || '',
        globalConfigPath: core.getInput('global_config_path') || cfgMod.DEFAULT_GLOBAL_CONFIG_PATH,
        useGlobalConfig: globalConfigMode(),
        useMarketplaceConfig: boolInput('use_marketplace_config', true),
        repoName: (process.env.GITHUB_REPOSITORY || '').split('/')[1] || '',
      });
    } catch (configError) {
      core.setFailed(`❌ Configuration error: ${configError.message}`);
      return;
    }

    const pkg = packageMetadata();
    core.info(`⚙️  ${pkg.name} v${pkg.version}`);
    core.info('   Config cascade:');
    for (const source of cfg.sourcePaths) {
      core.info(`      - ${source}`);
    }
    core.setOutput('config_sources', cfg.sourcePaths.join(','));

    const generateHumansTxt = parseBoolean(core.getInput('generate_humans_txt'), 'true');
    const humansOutputDir = core.getInput('humans_output_dir') || cfg.generate.outputDir;
    const humansFilename = core.getInput('humans_filename') || cfg.generate.filename;
    const humansComments = boolInput('humans_comments', cfg.generate.includeComments);
    const debugShowHumans = parseBoolean(core.getInput('debug_show_humans'), 'false');
    const sponsorName = core.getInput('prefer_company_name') || '';

    const inputConfig = parseHumansConfig({
      teamName: core.getInput('humans_team_name'),
      teamTitle: core.getInput('humans_team_title'),
      teamContact: core.getInput('humans_team_contact'),
      teamLocation: core.getInput('humans_team_location'),
      thanksName: core.getInput('humans_thanks_name'),
      thanksUrl: core.getInput('humans_thanks_url'),
      siteLastUpdate: core.getInput('humans_site_last_update'),
      siteStandards: core.getInput('humans_site_standards'),
      siteComponents: core.getInput('humans_site_components'),
      siteSoftware: core.getInput('humans_site_software'),
      siteLanguage: core.getInput('humans_site_language'),
      siteDoctype: core.getInput('humans_site_doctype'),
      siteIde: core.getInput('humans_site_ide'),
      includeComments: humansComments,
    });

    const authorResult = await authorMod.resolveAuthor(
      core.getInput('humans_author') || cfg.author,
      {
        root: process.cwd(),
        environ: process.env,
        provider: core.getInput('ai_provider') || cfg.remediation.aiFindingsSummaryProvider,
      },
    );
    core.setOutput('author', authorResult.author);
    core.setOutput('author_source', authorResult.source);

    let team = mergeEntries(inputConfig.team, cfg.fields.team);
    // The resolved author only seeds TEAM when nothing else already names one.
    if (authorResult.author && !team.some((entry) => entry.name)) {
      team = [{ name: authorResult.author }, ...team];
    }
    const thanks = mergeEntries(inputConfig.thanks, cfg.fields.thanks);
    const site = { ...cfg.fields.site, ...inputConfig.site };
    site.lastUpdate = resolveDate(site.lastUpdate);

    const humansConfig = { team, thanks, site, includeComments: humansComments };

    const hasTeamInfo = team.length > 0;
    const hasThanksInfo = thanks.length > 0;
    const hasSiteInfo = Object.keys(site).length > 0;

    printConfigHeader(core);
    printConfigSection(core, '📄', 'Output', {
      'Generate humans.txt:': generateHumansTxt ? 'Yes' : 'No',
      'Output Directory:': humansOutputDir,
      'Filename:': humansFilename,
    });
    printConfigSection(core, '👥', 'Sections', {
      'Author:': authorResult.author ? `${authorResult.author} (${authorResult.source})` : 'None',
      'Team entries:': hasTeamInfo ? String(team.length) : 'None',
      'Thanks entries:': hasThanksInfo ? String(thanks.length) : 'None',
      'Site fields:': String(Object.keys(site).length),
      'Include comments:': humansComments ? 'Yes' : 'No',
    });
    printConfigSection(core, '🧭', 'Audit & Reporting', {
      'Audit:': boolInput('enable_audit', cfg.audit.enable) ? 'Enabled' : 'Disabled',
      'Fail On:': core.getInput('audit_fail_on') || cfg.audit.failOn,
      'Max Age (days):': String(cfg.audit.maxAgeDays),
      'SARIF Output:': core.getInput('sarif_output') || '(disabled)',
      'JSON Report:': core.getInput('report_json') || '(disabled)',
    });

    printHumansSection(core, {
      generateHumansTxt,
      hasTeamInfo,
      hasThanksInfo,
      hasSiteInfo,
    });

    if (!generateHumansTxt) {
      core.info('Skipping humans.txt generation (disabled by input).');
      core.setOutput('humans_path', '');
      printFooter(core, sponsorName);
      return;
    }

    const content = buildHumansTxt(humansConfig);

    if (!content) {
      core.warning(
        'No humans.txt content was generated. Provide at least one section or enable comments.',
      );
      core.setOutput('humans_path', '');
      printFooter(core, sponsorName);
      return;
    }

    const outPath = path.join(humansOutputDir, humansFilename);
    ensureDir(path.dirname(outPath));
    const written = content.endsWith('\n') ? content : `${content}\n`;
    fs.writeFileSync(outPath, written, 'utf8');

    if (debugShowHumans) {
      core.info('\n[DEBUG] humans.txt content:');
      core.info(content);
    }

    const sectionsIncluded = ['TEAM', 'THANKS', 'SITE'].filter((section) =>
      content.includes(`/* ${section} */`),
    );
    printHumansValidation(core, {
      size: `${Buffer.byteLength(written, 'utf8')} bytes`,
      sections: sectionsIncluded,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // humanstxt.org Audit + Reporting
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (boolInput('enable_audit', cfg.audit.enable)) {
      const auditResult = auditMod.audit({
        cfg,
        content: written,
        filePath: outPath,
        outputDir: humansOutputDir,
      });

      reportMod.printAuditTable(core, auditResult);

      const failOnInput = (core.getInput('audit_fail_on') || '').trim();
      const failOn = cfgMod.FAIL_ON_LEVELS.includes(failOnInput) ? failOnInput : cfg.audit.failOn;
      if (failOnInput && !cfgMod.FAIL_ON_LEVELS.includes(failOnInput)) {
        core.warning(
          `audit_fail_on: '${failOnInput}' is not one of ${cfgMod.FAIL_ON_LEVELS.join(', ')}; using '${failOn}'.`,
        );
      }
      const failRun = auditMod.shouldFail(auditResult, failOn);
      reportMod.annotate(core, auditResult, failRun);

      const remediation = {
        ...cfg.remediation,
        enableAiFindingsSummary: boolInput(
          'enable_ai_summary',
          cfg.remediation.enableAiFindingsSummary,
        ),
        aiFindingsSummaryProvider:
          core.getInput('ai_provider') || cfg.remediation.aiFindingsSummaryProvider,
      };
      const summary = await aiMod.buildSummary(auditResult, remediation);
      if (summary.text) {
        core.info('');
        core.info(`🤖 Findings summary (${summary.provider}):`);
        for (const line of summary.text.split('\n')) {
          core.info(`   ${line}`);
        }
      }

      const sarifPath = core.getInput('sarif_output') || '';
      if (cfg.reporting.sarif && sarifPath) {
        try {
          sarifMod.dump(
            sarifMod.merge({
              runs: [sarifMod.auditRun(auditResult.findings, { baseDir: process.cwd() })],
            }),
            sarifPath,
          );
          core.info(`   ✓ SARIF written: ${sarifPath}`);
          core.setOutput('sarif_path', sarifPath);
        } catch (err) {
          core.warning(`   ⚠️  Failed to write SARIF: ${err.message}`);
        }
      }

      const reportPath = core.getInput('report_json') || '';
      if (cfg.reporting.jsonReport && reportPath) {
        try {
          reportMod.writeJsonReport(auditResult, reportPath, {
            ai_summary: summary.text,
            ai_provider: summary.provider,
            config_sources: [...cfg.sourcePaths],
            package: pkg,
          });
          core.info(`   ✓ JSON report written: ${reportPath}`);
          core.setOutput('report_json_path', reportPath);
        } catch (err) {
          core.warning(`   ⚠️  Failed to write JSON report: ${err.message}`);
        }
      }

      const recommendationsPath = core.getInput('recommendations_json') || '';
      if (cfg.reporting.recommendations && recommendationsPath) {
        try {
          reportMod.writeRecommendations(auditResult, recommendationsPath);
          core.info(`   ✓ Recommendations written: ${recommendationsPath}`);
          core.setOutput('recommendations_json_path', recommendationsPath);
        } catch (err) {
          core.warning(`   ⚠️  Failed to write recommendations: ${err.message}`);
        }
      }

      const skipsPath = core.getInput('skips_json') || '';
      if (skipsPath) {
        try {
          reportMod.writeSkips(auditResult, skipsPath);
          core.info(`   ✓ Skips written: ${skipsPath}`);
        } catch (err) {
          core.warning(`   ⚠️  Failed to write skips: ${err.message}`);
        }
      }

      if (boolInput('step_summary', cfg.reporting.stepSummary)) {
        reportMod.writeStepSummary(auditResult, {
          aiSummary: summary.text,
          aiProvider: summary.provider,
        });
      }

      const totals = auditResult.totals();
      core.setOutput('audit_verdict', auditResult.toJSON().verdict);
      core.setOutput('audit_pass_count', String(totals.pass));
      core.setOutput('audit_warn_count', String(totals.warn));
      core.setOutput('audit_fail_count', String(totals.fail));
      core.setOutput('audit_error_count', String(totals.error));
      core.setOutput('audit_skip_count', String(totals.skip));
      core.setOutput('ai_summary', summary.text);
    } else {
      core.info('');
      core.info('👥 humans.txt Audit: Disabled');
    }

    core.setOutput('humans_path', outPath);
    core.setOutput('team_entry_count', String(team.length));
    printFooter(core, sponsorName);
  } catch (error) {
    core.setFailed(error.message || error.toString());
  }
}

if (require.main === module) {
  run();
}

module.exports = run;
