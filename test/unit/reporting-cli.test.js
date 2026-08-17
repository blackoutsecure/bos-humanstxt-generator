/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Findings model, SARIF emission, reporting, AI, metadata, and CLI tests.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Finding, AuditResult, verdict, familyFor } = require('../../src/lib/findings');
const sarifMod = require('../../src/lib/sarif');
const reportMod = require('../../src/lib/report');
const aiMod = require('../../src/lib/ai');
const cfgMod = require('../../src/lib/config');
const { packageMetadata } = require('../../src/lib/metadata');
const { main, parseArgs, contentFromConfig } = require('../../src/cli');

function finding(overrides = {}) {
  return new Finding({
    ruleId: 'HM001',
    severity: 'fail',
    message: 'No TEAM section found.',
    location: 'dist/humans.txt',
    ...overrides,
  });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bos-humanstxt-report-'));
}

function resultWith(severities = ['fail', 'warn']) {
  return new AuditResult(
    severities.map(
      (severity, index) =>
        new Finding({ ruleId: `HM00${index + 1}`, severity, message: `finding ${index}` }),
    ),
  );
}

function capture() {
  const chunks = { out: '', err: '' };
  const stdout = process.stdout.write.bind(process.stdout);
  const stderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (text) => {
    chunks.out += text;
    return true;
  };
  process.stderr.write = (text) => {
    chunks.err += text;
    return true;
  };
  return {
    chunks,
    restore: () => {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    },
  };
}

async function runCli(argv) {
  const { chunks, restore } = capture();
  try {
    const code = await main(argv);
    return { code, ...chunks };
  } finally {
    restore();
  }
}

describe('lib/findings', () => {
  it('derives a title, remediation, and help URI from the rule id', () => {
    const f = finding();
    assert.strictEqual(f.title, 'TEAM section present');
    assert.match(f.remediation, /fields\.team/);
    assert.match(f.helpUri, /^https:\/\//);
  });

  it('produces a stable finding key independent of message wording', () => {
    assert.strictEqual(
      finding({ message: 'one' }).findingKey,
      finding({ message: 'two' }).findingKey,
    );
    assert.match(finding().findingKey, /^hm001-[0-9a-f]{16}$/);
  });

  it('counts totals per severity', () => {
    const result = new AuditResult([
      finding({ severity: 'pass' }),
      finding({ ruleId: 'HM002', severity: 'warn' }),
      finding({ ruleId: 'HM010', severity: 'fail' }),
      finding({ ruleId: 'HM020', severity: 'error' }),
      finding({ ruleId: 'HM030', severity: 'skip' }),
    ]);
    assert.deepStrictEqual(result.totals(), { pass: 1, warn: 1, fail: 1, error: 1, skip: 1 });
  });

  it('escalates the verdict from pass through inconclusive', () => {
    assert.strictEqual(verdict({ pass: 1, warn: 0, fail: 0, error: 0, skip: 0 })[0], 'Pass');
    assert.strictEqual(
      verdict({ pass: 0, warn: 1, fail: 0, error: 0, skip: 0 })[0],
      'Review recommended',
    );
    assert.strictEqual(
      verdict({ pass: 0, warn: 0, fail: 1, error: 0, skip: 0 })[0],
      'Action required',
    );
    assert.strictEqual(
      verdict({ pass: 0, warn: 0, fail: 0, error: 1, skip: 0 })[0],
      'Inconclusive',
    );
    assert.strictEqual(
      verdict({ pass: 0, warn: 0, fail: 0, error: 0, skip: 0 })[0],
      'Not assessed',
    );
  });

  it('buckets rule ids into display families', () => {
    assert.strictEqual(familyFor('HM001'), 0);
    assert.strictEqual(familyFor('HM010'), 1);
    assert.strictEqual(familyFor('HM020'), 2);
    assert.strictEqual(familyFor('HM030'), 3);
    assert.strictEqual(familyFor('ZZ999'), -1);
  });

  it('renders a Markdown report with summary, recommendations, and details', () => {
    const md = new AuditResult([finding()], { output_dir: 'dist' }).summaryMarkdown();
    assert.match(md, /# Blackout Secure Humans TXT Generator Audit Report/);
    assert.match(md, /\*\*Verdict:\*\* Action required/);
    assert.match(md, /## Run Context/);
    assert.match(md, /### Sections/);
  });

  it('renders a report even with no findings', () => {
    const md = new AuditResult([]).summaryMarkdown();
    assert.match(md, /Not assessed/);
    assert.match(md, /_No findings were emitted/);
  });

  it('escapes pipes so table rows stay well-formed', () => {
    const md = new AuditResult([finding({ message: 'a | b', severity: 'warn' })]).summaryMarkdown();
    assert.match(md, /a \\\| b/);
  });
});

describe('lib/sarif', () => {
  it('drops skip findings and keeps the rest', () => {
    const run = sarifMod.auditRun([
      finding({ severity: 'fail' }),
      finding({ ruleId: 'HM002', severity: 'skip' }),
      finding({ ruleId: 'HM010', severity: 'warn' }),
    ]);
    assert.strictEqual(run.results.length, 2);
    assert.deepStrictEqual(
      run.results.map((r) => r.level),
      ['error', 'warning'],
    );
  });

  it('emits one rule descriptor per rule id', () => {
    const run = sarifMod.auditRun([finding({ location: 'a' }), finding({ location: 'b' })]);
    assert.strictEqual(run.tool.driver.rules.length, 1);
    assert.strictEqual(run.results.length, 2);
  });

  it('carries the finding key as a partial fingerprint', () => {
    const f = finding();
    assert.strictEqual(
      sarifMod.auditRun([f]).results[0].partialFingerprints.bosHumansTxtFindingKey,
      f.findingKey,
    );
  });

  it('relativises file locations against the base dir', () => {
    const run = sarifMod.auditRun([finding()], { baseDir: process.cwd() });
    assert.strictEqual(
      run.results[0].locations[0].physicalLocation.artifactLocation.uri,
      'dist/humans.txt',
    );
  });

  it('merges runs and round-trips through disk', () => {
    const dir = tmpDir();
    try {
      const merged = sarifMod.merge(
        { runs: [sarifMod.auditRun([finding()])] },
        { runs: [sarifMod.auditRun([finding({ ruleId: 'HM002' })])] },
      );
      assert.strictEqual(merged.runs.length, 2);
      const file = path.join(dir, 'out.sarif');
      sarifMod.dump(merged, file);
      assert.strictEqual(sarifMod.load(file).runs.length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a malformed SARIF file', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'bad.sarif');
      fs.writeFileSync(file, '{"nope": true}', 'utf8');
      assert.throws(() => sarifMod.load(file), /missing `runs` array/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('lib/report', () => {
  function fakeCore() {
    const lines = [];
    return {
      lines,
      info: (m) => lines.push(['info', m]),
      warning: (m) => lines.push(['warning', m]),
      error: (m) => lines.push(['error', m]),
      setFailed: (m) => lines.push(['failed', m]),
    };
  }

  it('prints grouped families and a totals line', () => {
    const core = fakeCore();
    reportMod.printAuditTable(
      core,
      new AuditResult([
        finding({ ruleId: 'HM001', severity: 'pass' }),
        finding({ ruleId: 'HM010', severity: 'fail' }),
      ]),
    );
    const text = core.lines.map(([, m]) => m).join('\n');
    assert.match(text, /Sections/);
    assert.match(text, /Content hygiene/);
    assert.match(text, /1 pass/);
  });

  it('handles an empty audit without throwing', () => {
    const core = fakeCore();
    reportMod.printAuditTable(core, new AuditResult([]));
    assert.match(core.lines.map(([, m]) => m).join('\n'), /no findings/);
  });

  it('fails the job only when the exit policy says so', () => {
    const failing = fakeCore();
    reportMod.annotate(failing, new AuditResult([finding()]), true);
    assert.ok(failing.lines.some(([kind]) => kind === 'failed'));

    const advisory = fakeCore();
    reportMod.annotate(advisory, new AuditResult([finding()]), false);
    assert.ok(!advisory.lines.some(([kind]) => kind === 'failed'));
  });

  it('writes the step summary when the env var is present', () => {
    const dir = tmpDir();
    try {
      const file = path.join(dir, 'summary.md');
      assert.strictEqual(
        reportMod.writeStepSummary(new AuditResult([finding()]), {
          aiSummary: '- one bullet',
          aiProvider: 'local-heuristic',
          environ: { GITHUB_STEP_SUMMARY: file },
        }),
        true,
      );
      const body = fs.readFileSync(file, 'utf8');
      assert.match(body, /Audit Report/);
      assert.match(body, /## Findings Summary/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op when the step summary env var is absent', () => {
    assert.strictEqual(
      reportMod.writeStepSummary(new AuditResult([finding()]), { environ: {} }),
      false,
    );
  });

  it('writes the JSON report, recommendations, and skips sidecars', () => {
    const dir = tmpDir();
    try {
      const result = new AuditResult([finding(), finding({ ruleId: 'HM002', severity: 'skip' })], {
        team_entries: 0,
      });

      const report = JSON.parse(
        fs.readFileSync(
          reportMod.writeJsonReport(result, path.join(dir, 'report.json'), {
            ai_provider: 'local-heuristic',
          }),
          'utf8',
        ),
      );
      assert.strictEqual(report.schema_version, 1);
      assert.strictEqual(report.verdict, 'Action required');

      const recommendations = JSON.parse(
        fs.readFileSync(reportMod.writeRecommendations(result, path.join(dir, 'rec.json')), 'utf8'),
      );
      assert.strictEqual(recommendations.length, 2);

      const skips = JSON.parse(
        fs.readFileSync(reportMod.writeSkips(result, path.join(dir, 'skips.json')), 'utf8'),
      );
      assert.strictEqual(skips.length, 1);
      assert.strictEqual(skips[0].rule_id, 'HM002');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('lib/ai', () => {
  it('selects GitHub Models when a token is exposed', () => {
    const provider = aiMod.detectProvider('auto', { GITHUB_TOKEN: 'ghs_example' });
    assert.strictEqual(provider.name, 'github-models');
    assert.strictEqual(provider.endpoint, aiMod.GITHUB_MODELS_ENDPOINT);
  });

  it('prefers the dedicated models token and model overrides', () => {
    const provider = aiMod.detectProvider('github', {
      GITHUB_TOKEN: 'ghs_ignored',
      GITHUB_MODELS_TOKEN: 'ghs_preferred',
      GITHUB_MODELS_MODEL_HUMANS_TXT: 'openai/gpt-4.1-mini',
    });
    assert.strictEqual(provider.token, 'ghs_preferred');
    assert.strictEqual(provider.model, 'openai/gpt-4.1-mini');
  });

  it('returns null when no credentials are present', () => {
    assert.strictEqual(aiMod.detectProvider('auto', {}), null);
  });

  it('returns null for explicitly disabled providers', () => {
    for (const name of ['none', 'disabled', 'false', 'off']) {
      assert.strictEqual(aiMod.detectProvider(name, { GITHUB_TOKEN: 'x' }), null, name);
    }
  });

  it('requires both a key and an endpoint for external providers', () => {
    assert.strictEqual(aiMod.detectProvider('acme', { ACME_API_KEY: 'k' }), null);
    assert.strictEqual(
      aiMod.detectProvider('acme', {
        ACME_API_KEY: 'k',
        ACME_API_ENDPOINT: 'https://acme.test/v1/chat',
      }).name,
      'acme',
    );
  });

  it('rejects non-HTTPS provider endpoints', () => {
    assert.strictEqual(
      aiMod.detectProvider('acme', {
        ACME_API_KEY: 'k',
        ACME_API_ENDPOINT: 'http://acme.test/v1/chat',
      }),
      null,
    );
  });

  it('produces a factual local summary', () => {
    const text = aiMod.localSummary(resultWith());
    assert.match(text, /1 high, 1 warning/);
    assert.strictEqual(text.split('\n').length, 3);
  });

  it('reports a clean run in the local summary', () => {
    assert.match(aiMod.localSummary(resultWith(['pass'])), /No humans.txt control requires/);
  });

  it('falls back to the local summary when no provider is available', async () => {
    const summary = await aiMod.buildSummary(
      resultWith(),
      {
        enableAiFindingsSummary: true,
        aiFindingsSummaryProvider: 'auto',
        localHeuristicFallback: true,
      },
      { environ: {} },
    );
    assert.strictEqual(summary.provider, 'local-heuristic');
  });

  it('returns an empty summary when both AI and fallback are disabled', async () => {
    const summary = await aiMod.buildSummary(resultWith(), {
      enableAiFindingsSummary: false,
      aiFindingsSummaryProvider: 'auto',
      localHeuristicFallback: false,
    });
    assert.strictEqual(summary.text, '');
    assert.strictEqual(summary.provider, 'disabled');
  });

  it('treats a transport failure as ordinary unavailability', async () => {
    assert.strictEqual(
      await aiMod.summarize([], {
        name: 'acme',
        endpoint: 'http://127.0.0.1:1/unreachable',
        model: 'x',
        token: 'k',
      }),
      null,
    );
  });

  it('never throws for a null provider', async () => {
    assert.strictEqual(await aiMod.summarize([], null), null);
  });
});

describe('lib/metadata', () => {
  it('reports package identity from package.json', () => {
    const pkg = packageMetadata();
    assert.strictEqual(pkg.name, 'bos-humanstxt-generator');
    assert.match(pkg.version, /^\d+\.\d+\.\d+/);
  });
});

describe('cli', () => {
  it('parses the command, flags, and repeated inputs', () => {
    const parsed = parseArgs(['sarif', '--input', 'a.sarif', '--output', 'm.sarif']);
    assert.strictEqual(parsed.command, 'sarif');
    assert.deepStrictEqual(parsed.repeated.input, ['a.sarif']);
    assert.strictEqual(parsed.flags.output, 'm.sarif');
  });

  it('camel-cases multi-word flags', () => {
    assert.strictEqual(parseArgs(['audit', '--output-dir', 'site']).flags.outputDir, 'site');
  });

  it('handles the tri-state global config switches', () => {
    assert.strictEqual(parseArgs(['validate', '--use-global-config']).flags.useGlobalConfig, true);
    assert.strictEqual(parseArgs(['validate', '--no-global-config']).flags.useGlobalConfig, false);
    assert.strictEqual(parseArgs(['validate']).flags.useGlobalConfig, undefined);
  });

  it('rejects a flag with a missing value', () => {
    assert.throws(() => parseArgs(['audit', '--output-dir']), /requires a value/);
  });

  it('raises when nothing is configured to generate', () => {
    const cfg = cfgMod.resolve(os.tmpdir(), { useGlobalConfig: false });
    const withoutComments = { ...cfg, generate: { ...cfg.generate, includeComments: false } };
    assert.throws(() => contentFromConfig(withoutComments), /no humans.txt content configured/);
  });

  it('prints the package version', async () => {
    const { code, out } = await runCli(['version']);
    assert.strictEqual(code, 0);
    assert.match(out.trim(), /^\d+\.\d+\.\d+/);
  });

  it('prints usage with no command', async () => {
    const { code, out } = await runCli([]);
    assert.strictEqual(code, 0);
    assert.match(out, /bos-humanstxt <command>/);
  });

  it('rejects an unknown command', async () => {
    const { code, err } = await runCli(['teleport']);
    assert.strictEqual(code, 2);
    assert.match(err, /unknown command/);
  });

  it('validates and prints the resolved configuration cascade', async () => {
    const { code, out } = await runCli(['validate']);
    assert.strictEqual(code, 0);
    assert.match(out, /Package metadata:/);
    assert.match(out, /bundled:marketplace-config\.json/);
    assert.match(out, /require_team_section/);
  });

  it('surfaces a config error as exit code 2', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-humanstxt-cli-'));
    try {
      fs.writeFileSync(path.join(dir, 'bad.yml'), 'audit:\n  fail_on: sometimes\n', 'utf8');
      const { code, err } = await runCli(['validate', '--root', dir, '--config', 'bad.yml']);
      assert.strictEqual(code, 2);
      assert.match(err, /audit\.fail_on/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generates and then audits a humans.txt end to end', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-humanstxt-cli-'));
    try {
      fs.writeFileSync(
        path.join(dir, '.bos-humanstxt.yml'),
        [
          'humans_txt:',
          '  fields:',
          '    team:',
          '      - name: Ada Lovelace',
          '        contact: https://example.com/contact',
          '    site:',
          '      standards: HTML5',
          '      last_update: 2026/05/01',
          '',
        ].join('\n'),
        'utf8',
      );

      const generated = await runCli(['generate', '--root', dir, '--output-dir', 'site']);
      assert.strictEqual(generated.code, 0);
      assert.ok(fs.existsSync(path.join(dir, 'site', 'humans.txt')));

      const audited = await runCli([
        'audit',
        '--root',
        dir,
        '--output-dir',
        'site',
        '--json',
        path.join(dir, 'report.json'),
        '--fail-on',
        'never',
        '--no-ai',
      ]);
      assert.strictEqual(audited.code, 0);
      const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
      assert.strictEqual(report.findings.length, Object.keys(cfgMod.RULE_DEFAULTS).length);
      assert.strictEqual(report.ai_provider, 'local-heuristic');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a missing humans.txt for audit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-humanstxt-cli-'));
    try {
      const { code, err } = await runCli(['audit', '--root', dir]);
      assert.strictEqual(code, 2);
      assert.match(err, /humans\.txt not found/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires --output for the sarif command', async () => {
    const { code, err } = await runCli(['sarif']);
    assert.strictEqual(code, 2);
    assert.match(err, /--output is required/);
  });
});
