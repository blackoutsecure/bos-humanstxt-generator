/**
 * Copyright 2025 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('assert');
const { buildHumansTxt, parseHumansConfig } = require('../../src/lib/humans-parser');

describe('humans-parser', () => {
  describe('buildHumansTxt', () => {
    it('should generate minimal humans.txt with no content', () => {
      const result = buildHumansTxt({});
      assert.strictEqual(result, '');
    });

    it('should include TEAM section when team data is provided', () => {
      const result = buildHumansTxt({
        team: {
          name: 'Jane Doe',
          title: 'Lead Developer',
          contact: 'jane@example.com',
          location: 'San Francisco, CA',
        },
      });

      assert.ok(result.includes('/* TEAM */'));
      assert.ok(result.includes('Name: Jane Doe'));
      assert.ok(result.includes('Title: Lead Developer'));
      assert.ok(result.includes('Contact: jane@example.com'));
      assert.ok(result.includes('Location: San Francisco, CA'));
    });

    it('should include THANKS section when thanks data is provided', () => {
      const result = buildHumansTxt({
        thanks: {
          name: 'Open Source Community',
          url: 'https://github.com',
        },
      });

      assert.ok(result.includes('/* THANKS */'));
      assert.ok(result.includes('Open Source Community'));
      assert.ok(result.includes('https://github.com'));
    });

    it('should include SITE section when site data is provided', () => {
      const result = buildHumansTxt({
        site: {
          lastUpdate: '2025/12/02',
          standards: 'HTML5, CSS3',
          components: 'React, Next.js',
          software: 'Node.js, Webpack',
          language: 'English',
          doctype: 'HTML5',
          ide: 'VS Code',
        },
      });

      assert.ok(result.includes('/* SITE */'));
      assert.ok(result.includes('Last update: 2025/12/02'));
      assert.ok(result.includes('Standards: HTML5, CSS3'));
      assert.ok(result.includes('Components: React, Next.js'));
      assert.ok(result.includes('Software: Node.js, Webpack'));
      assert.ok(result.includes('Language: English'));
      assert.ok(result.includes('Doctype: HTML5'));
      assert.ok(result.includes('IDE: VS Code'));
    });

    it('should include header comments when includeComments is true', () => {
      const result = buildHumansTxt({
        team: { name: 'Test' },
        includeComments: true,
      });

      assert.ok(result.includes('/* HUMANS.TXT */'));
      assert.ok(result.includes('/* humanstxt.org */'));
    });

    it('should not include header comments when includeComments is false', () => {
      const result = buildHumansTxt({
        team: { name: 'Test' },
        includeComments: false,
      });

      assert.ok(!result.includes('/* HUMANS.TXT */'));
      assert.ok(!result.includes('/* humanstxt.org */'));
    });

    it('should include all sections when all data is provided', () => {
      const result = buildHumansTxt({
        team: { name: 'Team Name' },
        thanks: { name: 'Thanks Name' },
        site: { lastUpdate: '2025/12/02' },
        includeComments: true,
      });

      assert.ok(result.includes('/* HUMANS.TXT */'));
      assert.ok(result.includes('/* TEAM */'));
      assert.ok(result.includes('/* THANKS */'));
      assert.ok(result.includes('/* SITE */'));
    });

    it('should handle partial team data', () => {
      const result = buildHumansTxt({
        team: {
          name: 'Jane Doe',
          // title omitted
          contact: 'jane@example.com',
          // location omitted
        },
      });

      assert.ok(result.includes('Name: Jane Doe'));
      assert.ok(result.includes('Contact: jane@example.com'));
      assert.ok(!result.includes('Title:'));
      assert.ok(!result.includes('Location:'));
    });

    it('should handle partial site data', () => {
      const result = buildHumansTxt({
        site: {
          lastUpdate: '2025/12/02',
          standards: 'HTML5',
          // other fields omitted
        },
      });

      assert.ok(result.includes('Last update: 2025/12/02'));
      assert.ok(result.includes('Standards: HTML5'));
      assert.ok(!result.includes('Components:'));
      assert.ok(!result.includes('Software:'));
    });
  });

  describe('parseHumansConfig', () => {
    it('should parse team fields from inputs', () => {
      const inputs = {
        teamName: 'Jane Doe',
        teamTitle: 'Developer',
        teamContact: 'jane@example.com',
        teamLocation: 'SF',
      };

      const config = parseHumansConfig(inputs);

      assert.strictEqual(config.team.name, 'Jane Doe');
      assert.strictEqual(config.team.title, 'Developer');
      assert.strictEqual(config.team.contact, 'jane@example.com');
      assert.strictEqual(config.team.location, 'SF');
    });

    it('should parse thanks fields from inputs', () => {
      const inputs = {
        thanksName: 'Contributors',
        thanksUrl: 'https://example.com',
      };

      const config = parseHumansConfig(inputs);

      assert.strictEqual(config.thanks.name, 'Contributors');
      assert.strictEqual(config.thanks.url, 'https://example.com');
    });

    it('should parse site fields from inputs', () => {
      const inputs = {
        siteLastUpdate: '2025/12/02',
        siteStandards: 'HTML5',
        siteComponents: 'React',
        siteSoftware: 'Webpack',
        siteLanguage: 'English',
        siteDoctype: 'HTML5',
        siteIde: 'VS Code',
      };

      const config = parseHumansConfig(inputs);

      assert.strictEqual(config.site.lastUpdate, '2025/12/02');
      assert.strictEqual(config.site.standards, 'HTML5');
      assert.strictEqual(config.site.components, 'React');
      assert.strictEqual(config.site.software, 'Webpack');
      assert.strictEqual(config.site.language, 'English');
      assert.strictEqual(config.site.doctype, 'HTML5');
      assert.strictEqual(config.site.ide, 'VS Code');
    });

    it('should handle includeComments flag', () => {
      const config1 = parseHumansConfig({ includeComments: true });
      assert.strictEqual(config1.includeComments, true);

      const config2 = parseHumansConfig({ includeComments: false });
      assert.strictEqual(config2.includeComments, false);
    });

    it('should return empty objects for missing fields', () => {
      const config = parseHumansConfig({});

      assert.deepStrictEqual(config.team, {});
      assert.deepStrictEqual(config.thanks, {});
      assert.deepStrictEqual(config.site, {});
      assert.strictEqual(config.includeComments, false);
    });

    it('should handle partial inputs', () => {
      const inputs = {
        teamName: 'Test',
        siteStandards: 'HTML5',
        // other fields omitted
      };

      const config = parseHumansConfig(inputs);

      assert.strictEqual(config.team.name, 'Test');
      assert.strictEqual(config.site.standards, 'HTML5');
      assert.strictEqual(config.team.title, undefined);
      assert.strictEqual(config.thanks.name, undefined);
    });
  });

  describe('integration', () => {
    it('should generate complete humans.txt from parsed config', () => {
      const inputs = {
        teamName: 'Development Team',
        teamTitle: 'Full Stack Developers',
        teamContact: 'team@example.com',
        teamLocation: 'Remote',
        thanksName: 'GitHub Actions',
        thanksUrl: 'https://github.com/actions',
        siteLastUpdate: '2025/12/02',
        siteStandards: 'HTML5, CSS3',
        siteComponents: 'Alpine.js',
        siteSoftware: 'Vite',
        includeComments: true,
      };

      const config = parseHumansConfig(inputs);
      const result = buildHumansTxt(config);

      // Verify all sections are present
      assert.ok(result.includes('/* HUMANS.TXT */'));
      assert.ok(result.includes('/* TEAM */'));
      assert.ok(result.includes('/* THANKS */'));
      assert.ok(result.includes('/* SITE */'));

      // Verify content
      assert.ok(result.includes('Name: Development Team'));
      assert.ok(result.includes('Title: Full Stack Developers'));
      assert.ok(result.includes('GitHub Actions'));
      assert.ok(result.includes('Standards: HTML5, CSS3'));
    });
  });
});
