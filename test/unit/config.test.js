/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Layered configuration loader tests.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cfgMod = require('../../src/lib/config');

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  return target;
}

describe('lib/config', () => {
  const roots = [];

  afterEach(() => {
    while (roots.length) {
      fs.rmSync(roots.pop(), { recursive: true, force: true });
    }
  });

  function root() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-humanstxt-config-'));
    roots.push(dir);
    return dir;
  }

  it('falls back to the bundled marketplace baseline', () => {
    const cfg = cfgMod.resolve(root());
    assert.strictEqual(cfg.generate.includeComments, true);
    assert.strictEqual(cfg.generate.filename, 'humans.txt');
    assert.strictEqual(cfg.generate.outputDir, 'dist');
    assert.strictEqual(cfg.audit.failOn, 'fail');
    assert.strictEqual(cfg.audit.maxAgeDays, 365);
    assert.strictEqual(cfg.audit.rules.require_team_section, 'warn');
    assert.deepStrictEqual(cfg.sourcePaths, ['bundled:marketplace-config.json']);
  });

  it('starts from built-in defaults when the baseline is disabled', () => {
    const cfg = cfgMod.resolve(root(), { useMarketplaceConfig: false });
    assert.deepStrictEqual(cfg.sourcePaths, []);
    assert.strictEqual(cfg.audit.maxSizeKb, 16);
    assert.strictEqual(cfg.audit.rules.require_html_link, 'skip');
  });

  it('discovers .github/bos-universal-config.json and merges it', () => {
    const dir = root();
    write(
      dir,
      '.github/bos-universal-config.json',
      JSON.stringify({
        humans_txt: {
          owner: 'blackoutsecure',
          audit: { rules: { require_team_section: 'fail' } },
        },
      }),
    );

    const cfg = cfgMod.resolve(dir);
    assert.strictEqual(cfg.owner, 'blackoutsecure');
    assert.strictEqual(cfg.audit.rules.require_team_section, 'fail');
    assert.strictEqual(cfg.audit.rules.require_site_section, 'warn');
  });

  it('applies global config beneath the repository config', () => {
    const dir = root();
    write(
      dir,
      '.github/blackout-secure-humanstxt-generator-global-config.yml',
      'humans_txt:\n  audit:\n    rules:\n      require_team_section: fail\n      require_https_urls: fail\n',
    );
    write(
      dir,
      '.bos-humanstxt.yml',
      'humans_txt:\n  audit:\n    rules:\n      require_https_urls: skip\n',
    );

    const cfg = cfgMod.resolve(dir);
    assert.strictEqual(cfg.audit.rules.require_team_section, 'fail');
    assert.strictEqual(cfg.audit.rules.require_https_urls, 'skip');
    assert.strictEqual(cfg.sourcePaths.length, 3);
  });

  it('honours the tri-state global config toggle', () => {
    const dir = root();
    assert.throws(() => cfgMod.resolve(dir, { useGlobalConfig: true }), cfgMod.ConfigError);
    assert.doesNotThrow(() => cfgMod.resolve(dir, { useGlobalConfig: false }));
  });

  it('accepts a bare document without the humans_txt section', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'audit:\n  fail_on: never\n');
    assert.strictEqual(cfgMod.resolve(dir).audit.failOn, 'never');
  });

  it('parses multi-entry team and thanks rosters', () => {
    const dir = root();
    write(
      dir,
      '.bos-humanstxt.yml',
      [
        'fields:',
        '  team:',
        '    - name: Ada Lovelace',
        '      title: Engineer',
        '      contact: https://example.com/ada',
        '    - name: Grace Hopper',
        '      title: Architect',
        '  thanks:',
        '    - name: Open Source',
        '      url: https://opensource.org',
        '  site:',
        '    standards: HTML5',
        '    last_update: 2026/01/01',
        '',
      ].join('\n'),
    );

    const cfg = cfgMod.resolve(dir);
    assert.strictEqual(cfg.fields.team.length, 2);
    assert.strictEqual(cfg.fields.team[0].name, 'Ada Lovelace');
    assert.strictEqual(cfg.fields.team[1].title, 'Architect');
    assert.strictEqual(cfg.fields.thanks[0].url, 'https://opensource.org');
    assert.strictEqual(cfg.fields.site.lastUpdate, '2026/01/01');
  });

  it('rejects an unknown field on a team entry', () => {
    const dir = root();
    write(
      dir,
      '.bos-humanstxt.yml',
      'fields:\n  team:\n    - name: Ada\n      nickname: Countess\n',
    );
    assert.throws(() => cfgMod.resolve(dir), /unknown field/);
  });

  it('rejects a non-list team roster', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'fields:\n  team:\n    name: Ada\n');
    assert.throws(() => cfgMod.resolve(dir), /must be a list of mappings/);
  });

  it('rejects an unknown site field', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'fields:\n  site:\n    mascot: otter\n');
    assert.throws(() => cfgMod.resolve(dir), /unknown field/);
  });

  it('defaults project_name to the repository name', () => {
    const cfg = cfgMod.resolve(root(), { repoName: 'bos-humanstxt-generator' });
    assert.strictEqual(cfg.projectName, 'bos-humanstxt-generator');
  });

  it('rejects an unknown audit rule', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'audit:\n  rules:\n    require_unicorns: warn\n');
    assert.throws(() => cfgMod.resolve(dir), /unknown rule/);
  });

  it('rejects an invalid severity', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'audit:\n  rules:\n    require_team_section: explode\n');
    assert.throws(() => cfgMod.resolve(dir), /is not one of/);
  });

  it('rejects an invalid fail_on value', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'audit:\n  fail_on: sometimes\n');
    assert.throws(() => cfgMod.resolve(dir), /audit\.fail_on/);
  });

  it('rejects a filename containing a path separator', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'generate:\n  filename: nested/humans.txt\n');
    assert.throws(() => cfgMod.resolve(dir), /bare filename/);
  });

  it('rejects a non-positive integer limit', () => {
    const dir = root();
    write(dir, '.bos-humanstxt.yml', 'audit:\n  max_age_days: 0\n');
    assert.throws(() => cfgMod.resolve(dir), /positive integer/);
  });

  it('raises for a missing explicit config path', () => {
    assert.throws(() => cfgMod.resolve(root(), { configPath: 'nope.yml' }), /config not found/);
  });

  it('deep merges nested mappings and replaces lists', () => {
    const merged = cfgMod.deepMerge(
      { a: { b: 1, c: 2 }, list: [1, 2] },
      { a: { c: 3 }, list: [9] },
    );
    assert.deepStrictEqual(merged, { a: { b: 1, c: 3 }, list: [9] });
  });

  it('exposes a severity for every known rule', () => {
    const cfg = cfgMod.resolve(root());
    for (const name of Object.keys(cfgMod.RULE_DEFAULTS)) {
      assert.ok(
        cfgMod.SEVERITIES.includes(cfg.audit.rules[name]),
        `${name} resolved to a valid severity`,
      );
    }
  });
});
