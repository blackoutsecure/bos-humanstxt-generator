/**
 * Copyright 2025 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('assert');
const fs = require('fs');
const { TEST_CONFIG, getAbsolutePath, getPublicFilePath } = require('./test-config');
const { executeActionWithOverrides, cleanHumans } = require('./test-helpers');

// Use test config values for humans.txt generation
const HUMANS_CONFIG = TEST_CONFIG.HUMANS_GENERATION;
const PUBLIC_DIR = getAbsolutePath(TEST_CONFIG.PUBLIC_DIR);
const HUMANS_PATH = getPublicFilePath(TEST_CONFIG.HUMANS_TXT);

function ensureTestHtml() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
}

describe('Action: Humans.txt Generation', () => {
  before(() => {
    ensureTestHtml();
  });

  afterEach(() => {
    cleanHumans(PUBLIC_DIR);
    Object.keys(process.env).forEach((k) => {
      if (k.startsWith('INPUT_')) delete process.env[k];
    });
  });

  it('should generate humans.txt with team information', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'true',
      humans_team_name: 'Jane Doe',
      humans_team_title: 'Lead Developer',
      humans_team_contact: 'jane@example.com',
      humans_team_location: 'San Francisco, CA',
    });

    assert.ok(fs.existsSync(HUMANS_PATH), 'humans.txt should be generated');

    const content = fs.readFileSync(HUMANS_PATH, 'utf8');
    assert.ok(content.includes('/* TEAM */'));
    assert.ok(content.includes('Name: Jane Doe'));
    assert.ok(content.includes('Title: Lead Developer'));
    assert.ok(content.includes('Contact: jane@example.com'));
    assert.ok(content.includes('Location: San Francisco, CA'));
  });

  it('should generate humans.txt with site information', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'true',
      humans_site_standards: HUMANS_CONFIG.SITE_STANDARDS,
      humans_site_components: HUMANS_CONFIG.SITE_COMPONENTS,
      humans_site_software: HUMANS_CONFIG.SITE_SOFTWARE,
      humans_site_language: HUMANS_CONFIG.SITE_LANGUAGE,
    });

    assert.ok(fs.existsSync(HUMANS_PATH), 'humans.txt should be generated');

    const content = fs.readFileSync(HUMANS_PATH, 'utf8');
    assert.ok(content.includes('/* SITE */'));
    assert.ok(content.includes('Standards: ' + HUMANS_CONFIG.SITE_STANDARDS));
    assert.ok(content.includes('Components: ' + HUMANS_CONFIG.SITE_COMPONENTS));
    assert.ok(content.includes('Software: ' + HUMANS_CONFIG.SITE_SOFTWARE));
    assert.ok(content.includes('Language: ' + HUMANS_CONFIG.SITE_LANGUAGE));
  });

  it('should generate humans.txt with thanks information', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'true',
      humans_thanks_name: HUMANS_CONFIG.THANKS_NAME,
      humans_thanks_url: HUMANS_CONFIG.THANKS_URL,
    });

    assert.ok(fs.existsSync(HUMANS_PATH), 'humans.txt should be generated');

    const content = fs.readFileSync(HUMANS_PATH, 'utf8');
    assert.ok(content.includes('/* THANKS */'));
    assert.ok(content.includes(HUMANS_CONFIG.THANKS_NAME));
    assert.ok(content.includes(HUMANS_CONFIG.THANKS_URL));
  });

  it('should include header comments when humans_comments is true', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'true',
      humans_team_name: HUMANS_CONFIG.TEAM_NAME,
      humans_comments: 'true',
    });

    const content = fs.readFileSync(HUMANS_PATH, 'utf8');
    assert.ok(content.includes('/* HUMANS.TXT */'));
    assert.ok(content.includes('/* humanstxt.org */'));
  });

  it('should not include header comments when humans_comments is false', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'true',
      humans_team_name: HUMANS_CONFIG.TEAM_NAME,
      humans_comments: 'false',
    });

    const content = fs.readFileSync(HUMANS_PATH, 'utf8');
    assert.ok(!content.includes('/* HUMANS.TXT */'));
    assert.ok(!content.includes('/* humanstxt.org */'));
  });

  it('should not generate humans.txt when generate_humans_txt is false', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'false',
      humans_team_name: HUMANS_CONFIG.TEAM_NAME,
    });

    assert.ok(!fs.existsSync(HUMANS_PATH), 'humans.txt should not be generated');
  });

  it('should generate humans.txt with all sections', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'true',
      humans_team_name: HUMANS_CONFIG.TEAM_NAME,
      humans_team_title: HUMANS_CONFIG.TEAM_TITLE,
      humans_thanks_name: HUMANS_CONFIG.THANKS_NAME,
      humans_thanks_url: HUMANS_CONFIG.THANKS_URL,
      humans_site_standards: HUMANS_CONFIG.SITE_STANDARDS,
      humans_site_components: HUMANS_CONFIG.SITE_COMPONENTS,
      humans_comments: 'true',
    });

    const content = fs.readFileSync(HUMANS_PATH, 'utf8');

    // Verify all sections
    assert.ok(content.includes('/* HUMANS.TXT */'));
    assert.ok(content.includes('/* TEAM */'));
    assert.ok(content.includes('/* THANKS */'));
    assert.ok(content.includes('/* SITE */'));

    // Verify content
    assert.ok(content.includes('Name: ' + HUMANS_CONFIG.TEAM_NAME));
    assert.ok(content.includes('Title: ' + HUMANS_CONFIG.TEAM_TITLE));
    assert.ok(content.includes(HUMANS_CONFIG.THANKS_NAME));
    assert.ok(content.includes('Standards: ' + HUMANS_CONFIG.SITE_STANDARDS));
  });

  it('should auto-populate last update date', async () => {
    await executeActionWithOverrides(PUBLIC_DIR, {
      generate_humans_txt: 'true',
      humans_site_standards: HUMANS_CONFIG.SITE_STANDARDS,
    });

    const content = fs.readFileSync(HUMANS_PATH, 'utf8');
    assert.ok(content.includes('Last update:'));
    // Verify it's in YYYY/MM/DD format
    assert.ok(/Last update: \d{4}\/\d{2}\/\d{2}/.test(content));
  });

  it('should use custom output directory', async () => {
    try {
      await executeActionWithOverrides(PUBLIC_DIR, {
        humans_output_dir: TEST_CONFIG.PUBLIC_DIR,
        generate_humans_txt: 'true',
        humans_team_name: HUMANS_CONFIG.TEAM_NAME,
      });

      assert.ok(fs.existsSync(HUMANS_PATH), 'humans.txt should be in custom directory');
    } finally {
      // Clean up
      if (fs.existsSync(HUMANS_PATH)) {
        fs.unlinkSync(HUMANS_PATH);
      }
    }
  });
});
