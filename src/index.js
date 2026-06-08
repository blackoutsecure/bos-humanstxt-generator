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

function parseBoolean(input, defaultValue) {
  const raw = input === undefined || input === null ? undefined : String(input);
  if (raw === undefined) return /^true$/i.test(String(defaultValue || 'false'));
  return /^true$/i.test(raw);
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function resolveDate(input) {
  return input || new Date().toISOString().split('T')[0].replace(/-/g, '/');
}

async function run() {
  try {
    printHeader(core);

    const generateHumansTxt = parseBoolean(core.getInput('generate_humans_txt'), 'true');
    const humansOutputDir = core.getInput('humans_output_dir') || 'dist';
    const humansFilename = core.getInput('humans_filename') || 'humans.txt';
    const humansComments = parseBoolean(core.getInput('humans_comments'), 'true');
    const debugShowHumans = parseBoolean(core.getInput('debug_show_humans'), 'false');
    const sponsorName = core.getInput('prefer_company_name') || '';

    const humansConfig = parseHumansConfig({
      teamName: core.getInput('humans_team_name'),
      teamTitle: core.getInput('humans_team_title'),
      teamContact: core.getInput('humans_team_contact'),
      teamLocation: core.getInput('humans_team_location'),
      thanksName: core.getInput('humans_thanks_name'),
      thanksUrl: core.getInput('humans_thanks_url'),
      siteLastUpdate: resolveDate(core.getInput('humans_site_last_update')),
      siteStandards: core.getInput('humans_site_standards'),
      siteComponents: core.getInput('humans_site_components'),
      siteSoftware: core.getInput('humans_site_software'),
      siteLanguage: core.getInput('humans_site_language'),
      siteDoctype: core.getInput('humans_site_doctype'),
      siteIde: core.getInput('humans_site_ide'),
      includeComments: humansComments,
    });

    const hasTeamInfo = Object.keys(humansConfig.team).length > 0;
    const hasThanksInfo = Object.keys(humansConfig.thanks).length > 0;
    const hasSiteInfo = Object.keys(humansConfig.site).length > 0;

    printConfigHeader(core);
    printConfigSection(core, '📄', 'Output', {
      'Generate humans.txt:': generateHumansTxt ? 'Yes' : 'No',
      'Output Directory:': humansOutputDir,
      'Filename:': humansFilename,
    });
    printConfigSection(core, '👥', 'Sections', {
      'Team info:': hasTeamInfo ? 'Provided' : 'None',
      'Thanks info:': hasThanksInfo ? 'Provided' : 'None',
      'Site info:': hasSiteInfo ? 'Provided' : 'None',
      'Include comments:': humansComments ? 'Yes' : 'No',
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
    fs.writeFileSync(outPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');

    if (debugShowHumans) {
      core.info('\n[DEBUG] humans.txt content:');
      core.info(content);
    }

    const sectionsIncluded = ['TEAM', 'THANKS', 'SITE'].filter((section) =>
      content.includes(`/* ${section} */`),
    );
    printHumansValidation(core, {
      size: `${Buffer.byteLength(content, 'utf8')} bytes`,
      sections: sectionsIncluded,
    });

    core.setOutput('humans_path', outPath);
    printFooter(core, sponsorName);
  } catch (error) {
    core.setFailed(error.message || error.toString());
  }
}

if (require.main === module) {
  run();
}

module.exports = run;
