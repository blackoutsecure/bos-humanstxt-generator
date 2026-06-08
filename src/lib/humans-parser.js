/**
 * Copyright 2025 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Humans.txt generation utilities
 * Following the humanstxt.org standard
 */

const { getHumansTxtHeader } = require('./project-config');

/**
 * Build humans.txt content following humanstxt.org standard
 * @param {object} options - Configuration options
 * @param {object} options.team - Team section data
 * @param {string} options.team.name - Team member name
 * @param {string} options.team.title - Job title or role
 * @param {string} options.team.contact - Contact information (email, twitter, etc.)
 * @param {string} options.team.location - Location (city, country, etc.)
 * @param {object} options.thanks - Thanks section data
 * @param {string} options.thanks.name - Person or organization to thank
 * @param {string} options.thanks.url - URL to their website
 * @param {object} options.site - Site section data
 * @param {string} options.site.lastUpdate - Last update date
 * @param {string} options.site.standards - Standards used
 * @param {string} options.site.components - Components/tools used
 * @param {string} options.site.software - Software used
 * @param {string} options.site.language - Site language
 * @param {string} options.site.doctype - Document type
 * @param {string} options.site.ide - IDE used
 * @param {boolean} options.includeComments - Include explanatory comments
 * @returns {string} - Generated humans.txt content
 */
function buildHumansTxt(options = {}) {
  const { team = {}, thanks = {}, site = {}, includeComments = false } = options;

  const hasSections =
    Object.keys(team).length > 0 || Object.keys(thanks).length > 0 || Object.keys(site).length > 0;

  // If there is no content and comments are not requested, return empty output
  if (!hasSections && !includeComments) {
    return '';
  }

  const lines = [];

  // Add generation header for branded output
  const headerLines = getHumansTxtHeader().split('\n');
  lines.push(...headerLines);
  lines.push('');

  // Add header comment if enabled
  if (includeComments) {
    lines.push('/* HUMANS.TXT */');
    lines.push('/* humanstxt.org */');
    lines.push('');
  }

  // TEAM Section
  if (Object.keys(team).length > 0) {
    lines.push('/* TEAM */');
    if (team.name) lines.push(`  Name: ${team.name}`);
    if (team.title) lines.push(`  Title: ${team.title}`);
    if (team.contact) lines.push(`  Contact: ${team.contact}`);
    if (team.location) lines.push(`  Location: ${team.location}`);
    lines.push('');
  }

  // THANKS Section
  if (Object.keys(thanks).length > 0) {
    lines.push('/* THANKS */');
    if (thanks.name) lines.push(`  ${thanks.name}`);
    if (thanks.url) lines.push(`  ${thanks.url}`);
    lines.push('');
  }

  // SITE Section
  if (Object.keys(site).length > 0) {
    lines.push('/* SITE */');
    if (site.lastUpdate) lines.push(`  Last update: ${site.lastUpdate}`);
    if (site.standards) lines.push(`  Standards: ${site.standards}`);
    if (site.components) lines.push(`  Components: ${site.components}`);
    if (site.software) lines.push(`  Software: ${site.software}`);
    if (site.language) lines.push(`  Language: ${site.language}`);
    if (site.doctype) lines.push(`  Doctype: ${site.doctype}`);
    if (site.ide) lines.push(`  IDE: ${site.ide}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse humans.txt configuration from inputs
 * @param {object} inputs - Raw input values
 * @returns {object} - Parsed configuration
 */
function parseHumansConfig(inputs) {
  const config = {
    team: {},
    thanks: {},
    site: {},
    includeComments: inputs.includeComments || false,
  };

  // Parse team fields
  if (inputs.teamName) config.team.name = inputs.teamName;
  if (inputs.teamTitle) config.team.title = inputs.teamTitle;
  if (inputs.teamContact) config.team.contact = inputs.teamContact;
  if (inputs.teamLocation) config.team.location = inputs.teamLocation;

  // Parse thanks fields
  if (inputs.thanksName) config.thanks.name = inputs.thanksName;
  if (inputs.thanksUrl) config.thanks.url = inputs.thanksUrl;

  // Parse site fields
  if (inputs.siteLastUpdate) config.site.lastUpdate = inputs.siteLastUpdate;
  if (inputs.siteStandards) config.site.standards = inputs.siteStandards;
  if (inputs.siteComponents) config.site.components = inputs.siteComponents;
  if (inputs.siteSoftware) config.site.software = inputs.siteSoftware;
  if (inputs.siteLanguage) config.site.language = inputs.siteLanguage;
  if (inputs.siteDoctype) config.site.doctype = inputs.siteDoctype;
  if (inputs.siteIde) config.site.ide = inputs.siteIde;

  return config;
}

module.exports = {
  buildHumansTxt,
  parseHumansConfig,
};
