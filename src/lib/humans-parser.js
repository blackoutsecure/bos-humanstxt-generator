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

  // TEAM and THANKS accept either a single mapping (legacy) or a list.
  const teamEntries = toEntryList(team);
  const thanksEntries = toEntryList(thanks);

  const hasSections =
    teamEntries.length > 0 || thanksEntries.length > 0 || Object.keys(site).length > 0;

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
  if (teamEntries.length > 0) {
    lines.push('/* TEAM */');
    teamEntries.forEach((member, index) => {
      if (index > 0) lines.push('');
      if (member.name) lines.push(`  Name: ${member.name}`);
      if (member.title) lines.push(`  Title: ${member.title}`);
      if (member.contact) lines.push(`  Contact: ${member.contact}`);
      if (member.location) lines.push(`  Location: ${member.location}`);
    });
    lines.push('');
  }

  // THANKS Section
  if (thanksEntries.length > 0) {
    lines.push('/* THANKS */');
    thanksEntries.forEach((entry, index) => {
      if (index > 0) lines.push('');
      if (entry.name) lines.push(`  ${entry.name}`);
      if (entry.url) lines.push(`  ${entry.url}`);
    });
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

/**
 * Normalise a single mapping or a list of mappings into a list of entries.
 * @param {object|object[]} value - Raw section value.
 * @returns {object[]} Entries with at least one populated field.
 */
function toEntryList(value) {
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter(
    (entry) => entry && typeof entry === 'object' && Object.keys(entry).length > 0,
  );
}

/**
 * Parse humans.txt content into sections for auditing.
 *
 * Content lines are grouped under the most recent section banner (TEAM,
 * THANKS, or SITE); lines appearing before any banner are reported as
 * orphans so the audit can flag malformed files.
 *
 * @param {string} content - Raw humans.txt content.
 * @returns {object} `{ sections, orphanLines, hasBom }`
 */
function parseHumansTxt(content = '') {
  const hasBom = content.charCodeAt(0) === 0xfeff;
  const body = hasBom ? content.slice(1) : content;

  const sections = {};
  const orphanLines = [];
  let current = null;

  body.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const banner = line.match(/^\/\*\s*(.+?)\s*\*\/$/);
    if (banner) {
      const name = banner[1].toUpperCase();
      // Only the three standard banners open a section; anything else
      // (the generator header, `humanstxt.org`) is a plain comment.
      if (['TEAM', 'THANKS', 'SITE'].includes(name)) {
        current = name;
        sections[current] ||= [];
      } else {
        current = null;
      }
      return;
    }

    if (current) sections[current].push(line);
    else orphanLines.push({ line: index + 1, text: line });
  });

  return { sections, orphanLines, hasBom };
}

/**
 * Split a TEAM section body into per-member records.
 * @param {string[]} lines - Content lines under the TEAM banner.
 * @returns {object[]} One record per member, keyed by lowercased field.
 */
function parseTeamEntries(lines = []) {
  const entries = [];
  let current = {};

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    // A repeated `Name:` starts the next member record.
    if (key === 'name' && Object.keys(current).length) {
      entries.push(current);
      current = {};
    }
    current[key] = match[2].trim();
  }

  if (Object.keys(current).length) entries.push(current);
  return entries;
}

module.exports = {
  buildHumansTxt,
  parseHumansConfig,
  parseHumansTxt,
  parseTeamEntries,
  toEntryList,
};
