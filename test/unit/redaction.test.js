const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { redactSensitive, redactObject } = require('../../src/lib/redaction');
const report = require('../../src/lib/report');
const sarif = require('../../src/lib/sarif');

describe('redaction boundaries', () => {
  const token = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
  const options = { enabled: true, placeholder: '[redacted]', extraPatterns: ['CUSTOM-[A-Z]+'] };

  it('masks credential-shaped values while preserving context and ordinary text', () => {
    const value = `password=secret token=${token} custom=CUSTOM-VALUE ordinary text`;
    const masked = redactSensitive(value, options);
    assert.match(masked, /password=\[redacted\]/);
    assert.match(masked, /token=\[redacted\]/);
    assert.match(masked, /custom=\[redacted\]/);
    assert.match(masked, /ordinary text/);
    assert.ok(!masked.includes(token));
  });

  it('redacts report payload strings without changing keys', () => {
    assert.deepStrictEqual(redactObject({ token: token, ordinary: 'hello' }, options), {
      token: '[redacted]',
      ordinary: 'hello',
    });
  });

  it('redacts JSON reports but leaves SARIF findings full fidelity', () => {
    const finding = {
      ruleId: 'HM001',
      severity: 'fail',
      title: 'Finding',
      remediation: 'Fix it',
      findingKey: 'hm001-key',
      message: `token=${token}`,
      location: 'dist/humans.txt',
    };
    const result = {
      toJSON: () => ({ findings: [finding] }),
      recommendations: () => [{ message: finding.message }],
      skipped: [],
    };
    const reportPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'redaction-')),
      'report.json',
    );
    report.writeJsonReport(result, reportPath, {}, options);
    assert.ok(!fs.readFileSync(reportPath, 'utf8').includes(token));
    assert.ok(JSON.stringify(sarif.auditRun([finding])).includes(token));
  });
});
