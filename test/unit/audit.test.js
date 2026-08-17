/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * humanstxt.org audit rule tests plus the multi-entry parser.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cfgMod = require('../../src/lib/config');
const { audit, shouldFail } = require('../../src/lib/audit');
const { buildHumansTxt, parseHumansTxt, parseTeamEntries } = require('../../src/lib/humans-parser');

const NOW = new Date('2026-06-01T00:00:00Z');

function configWith(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-humanstxt-cfg-'));
  fs.writeFileSync(
    path.join(dir, '.bos-humanstxt.yml'),
    JSON.stringify({ humans_txt: overrides }),
    'utf8',
  );
  const cfg = cfgMod.resolve(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return cfg;
}

function compliant() {
  return [
    '/* TEAM */',
    '  Name: Ada Lovelace',
    '  Title: Engineer',
    '  Contact: https://blackoutsecure.app/contact',
    '  Location: Remote',
    '',
    '/* THANKS */',
    '  Open Source',
    '  https://opensource.org',
    '',
    '/* SITE */',
    '  Last update: 2026/05/01',
    '  Standards: HTML5',
    '  Components: Astro',
    '',
  ].join('\n');
}

function run(
  content,
  { cfg = configWith(), filePath = 'dist/humans.txt', outputDir = 'dist' } = {},
) {
  return audit({ cfg, content, filePath, outputDir, now: NOW });
}

function findingFor(result, ruleId) {
  return result.findings.find((f) => f.ruleId === ruleId);
}

describe('lib/humans-parser', () => {
  it('renders multiple team members under one banner', () => {
    const content = buildHumansTxt({
      team: [
        { name: 'Ada', title: 'Engineer' },
        { name: 'Grace', title: 'Architect' },
      ],
      includeComments: false,
    });
    assert.strictEqual((content.match(/\/\* TEAM \*\//g) || []).length, 1);
    assert.match(content, /Name: Ada/);
    assert.match(content, /Name: Grace/);
  });

  it('renders multiple thanks entries', () => {
    const content = buildHumansTxt({
      thanks: [
        { name: 'One', url: 'https://one.example' },
        { name: 'Two', url: 'https://two.example' },
      ],
    });
    assert.match(content, /https:\/\/one\.example/);
    assert.match(content, /https:\/\/two\.example/);
  });

  it('still accepts a single mapping for backward compatibility', () => {
    const content = buildHumansTxt({ team: { name: 'Solo' } });
    assert.match(content, /Name: Solo/);
  });

  it('returns empty output with no sections and no comments', () => {
    assert.strictEqual(buildHumansTxt({}), '');
  });

  it('parses sections and ignores non-standard banners', () => {
    const parsed = parseHumansTxt(compliant());
    assert.deepStrictEqual(Object.keys(parsed.sections).sort(), ['SITE', 'TEAM', 'THANKS']);
    assert.strictEqual(parsed.orphanLines.length, 0);
  });

  it('reports content lines outside any section banner', () => {
    const parsed = parseHumansTxt('stray line\n/* TEAM */\n  Name: Ada\n');
    assert.strictEqual(parsed.orphanLines.length, 1);
    assert.strictEqual(parsed.orphanLines[0].text, 'stray line');
  });

  it('detects and strips a byte-order mark', () => {
    const parsed = parseHumansTxt('\uFEFF/* TEAM */\n  Name: Ada\n');
    assert.strictEqual(parsed.hasBom, true);
    assert.strictEqual(parsed.orphanLines.length, 0);
  });

  it('splits team lines into per-member records on repeated Name', () => {
    const entries = parseTeamEntries([
      'Name: Ada',
      'Title: Engineer',
      'Name: Grace',
      'Title: Architect',
    ]);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[1].name, 'Grace');
  });
});

describe('lib/audit', () => {
  it('emits a finding for every known rule', () => {
    const result = run(compliant());
    assert.strictEqual(result.findings.length, Object.keys(cfgMod.RULE_DEFAULTS).length);
  });

  it('passes every non-skipped control for a compliant file', () => {
    const result = run(compliant());
    const attention = result.findings.filter((f) => f.severity !== 'pass' && f.severity !== 'skip');
    assert.deepStrictEqual(
      attention.map((f) => f.ruleId),
      [],
    );
  });

  it('records disabled controls as skip rather than dropping them', () => {
    const cfg = configWith({ audit: { rules: { require_team_section: 'skip' } } });
    const finding = findingFor(run('/* SITE */\n  Standards: HTML5\n', { cfg }), 'HM001');
    assert.strictEqual(finding.severity, 'skip');
    assert.match(finding.message, /Control disabled/);
  });

  it('flags missing TEAM and SITE sections', () => {
    const result = run('/* THANKS */\n  Someone\n');
    assert.strictEqual(findingFor(result, 'HM001').severity, 'warn');
    assert.strictEqual(findingFor(result, 'HM002').severity, 'warn');
    assert.strictEqual(findingFor(result, 'HM003').severity, 'skip');
  });

  it('flags a team roster with no contact', () => {
    const result = run('/* TEAM */\n  Name: Ada\n  Title: Engineer\n');
    const finding = findingFor(result, 'HM004');
    assert.strictEqual(finding.severity, 'warn');
    assert.strictEqual(finding.evidence.total, 1);
  });
  it('flags insecure http URLs', () => {
    const result = run('/* THANKS */\n  http://insecure.example\n');
    const finding = findingFor(result, 'HM010');
    assert.strictEqual(finding.severity, 'warn');
    assert.deepStrictEqual(finding.evidence.samples, ['http://insecure.example']);
  });

  it('validates the Last update format', () => {
    const bad = run('/* SITE */\n  Last update: June 2026\n');
    assert.strictEqual(findingFor(bad, 'HM011').severity, 'warn');

    const good = run('/* SITE */\n  Last update: 2026/05/01\n');
    assert.strictEqual(findingFor(good, 'HM011').severity, 'pass');
  });

  it('flags a stale Last update against the configured window', () => {
    const cfg = configWith({ audit: { max_age_days: 7 } });
    const result = run('/* SITE */\n  Last update: 2026/01/01\n', { cfg });
    const finding = findingFor(result, 'HM012');
    assert.strictEqual(finding.severity, 'warn');
    assert.strictEqual(finding.evidence.max_age_days, 7);
  });

  it('detects placeholder content', () => {
    const result = run('/* TEAM */\n  Name: Your Name\n  Contact: https://blackoutsecure.app/x\n');
    const finding = findingFor(result, 'HM013');
    assert.strictEqual(finding.severity, 'warn');
    assert.ok(finding.evidence.total >= 1);
  });

  it('treats example.com as a placeholder domain', () => {
    const result = run('/* THANKS */\n  https://example.com/thanks\n');
    assert.strictEqual(findingFor(result, 'HM013').severity, 'warn');
  });

  it('detects plaintext email addresses when enabled', () => {
    const cfg = configWith({ audit: { rules: { forbid_email_addresses: 'warn' } } });
    const result = run('/* TEAM */\n  Name: Ada\n  Contact: ada@lovelace.test\n', { cfg });
    assert.strictEqual(findingFor(result, 'HM014').severity, 'warn');
  });

  it('detects duplicate team entries', () => {
    const result = run('/* TEAM */\n  Name: Ada\n  Name: Ada\n');
    const finding = findingFor(result, 'HM015');
    assert.strictEqual(finding.severity, 'warn');
    assert.deepStrictEqual(finding.evidence.samples, ['ada']);
  });

  it('requires the file at the site root', () => {
    const good = run(compliant());
    assert.strictEqual(findingFor(good, 'HM020').severity, 'pass');

    const nested = run(compliant(), { filePath: 'dist/meta/humans.txt' });
    assert.strictEqual(findingFor(nested, 'HM020').severity, 'warn');
  });

  it('enforces the configured size limit', () => {
    const cfg = configWith({ audit: { max_size_kb: 1 } });
    const result = run(`/* SITE */\n  Standards: ${'x'.repeat(2048)}\n`, { cfg });
    assert.strictEqual(findingFor(result, 'HM021').severity, 'warn');
  });

  it('detects an HTML rel=author link when enabled', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-humanstxt-html-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'index.html'),
        '<html><head><link rel="author" href="/humans.txt"></head></html>',
        'utf8',
      );
      const cfg = configWith({ audit: { rules: { require_html_link: 'warn' } } });
      const result = audit({
        cfg,
        content: compliant(),
        filePath: path.join(dir, 'humans.txt'),
        outputDir: dir,
        now: NOW,
      });
      const finding = findingFor(result, 'HM022');
      assert.strictEqual(finding.severity, 'pass');
      assert.deepStrictEqual(finding.evidence.samples, ['index.html']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a byte-order mark', () => {
    assert.strictEqual(findingFor(run(`\uFEFF${compliant()}`), 'HM030').severity, 'warn');
  });

  it('flags content outside any section banner', () => {
    const result = run(`stray\n${compliant()}`);
    const finding = findingFor(result, 'HM031');
    assert.strictEqual(finding.severity, 'warn');
    assert.strictEqual(finding.evidence.orphan_lines.length, 1);
  });

  it('drives the exit disposition from fail_on', () => {
    const cfg = configWith({ audit: { rules: { require_team_section: 'fail' } } });
    const result = run('/* SITE */\n  Standards: HTML5\n', { cfg });
    assert.strictEqual(shouldFail(result, 'fail'), true);
    assert.strictEqual(shouldFail(result, 'never'), false);
  });

  it('exposes run context for reporting', () => {
    const result = run(compliant());
    assert.strictEqual(result.context.team_entries, 1);
    assert.strictEqual(result.context.last_update, '2026/05/01');
    assert.ok(result.context.size_bytes > 0);
  });
});
