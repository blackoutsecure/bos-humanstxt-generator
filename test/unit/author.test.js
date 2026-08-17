/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Author resolution tests.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const authorMod = require('../../src/lib/author');

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
}

/** Env that makes `detectProvider` return a GitHub Models descriptor. */
const AI_ENV = { GITHUB_TOKEN: 'token', GITHUB_REPOSITORY_OWNER: 'blackoutsecure' };
const OFFLINE_ENV = { GITHUB_REPOSITORY_OWNER: 'blackoutsecure' };

function stubFetch(content) {
  return async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

describe('lib/author', () => {
  const roots = [];
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    while (roots.length) {
      fs.rmSync(roots.pop(), { recursive: true, force: true });
    }
  });

  function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-author-'));
    roots.push(root);
    return root;
  }

  describe('sanitizeAuthor', () => {
    it('trims wrapping punctuation and collapses whitespace', () => {
      assert.equal(authorMod.sanitizeAuthor('  "Blackout   Secure".  '), 'Blackout Secure');
    });

    it('keeps only the first line', () => {
      assert.equal(authorMod.sanitizeAuthor('Blackout Secure\nignored'), 'Blackout Secure');
    });

    it('rejects a rambling model response', () => {
      const rambling = 'The author of this project appears to be a company called Blackout Secure';
      assert.equal(authorMod.sanitizeAuthor(rambling), '');
    });

    it('rejects an over-long value', () => {
      assert.equal(authorMod.sanitizeAuthor('x'.repeat(200)), '');
    });

    it('returns empty for non-strings', () => {
      assert.equal(authorMod.sanitizeAuthor(null), '');
      assert.equal(authorMod.sanitizeAuthor(undefined), '');
    });
  });

  describe('resolveAuthor', () => {
    it('passes an explicit name through without contacting a provider', async () => {
      globalThis.fetch = () => assert.fail('explicit author must not call the provider');
      const result = await authorMod.resolveAuthor('Ada Lovelace', {
        root: makeRoot(),
        environ: AI_ENV,
      });
      assert.deepEqual(result, { author: 'Ada Lovelace', source: 'explicit' });
    });

    it('treats none and empty as disabled', async () => {
      const root = makeRoot();
      for (const value of ['none', '', 'off', 'disabled']) {
        const result = await authorMod.resolveAuthor(value, { root, environ: OFFLINE_ENV });
        assert.deepEqual(result, { author: '', source: 'disabled' });
      }
    });

    it('uses the AI answer when auto and a provider is available', async () => {
      const root = makeRoot();
      write(root, 'package.json', JSON.stringify({ author: 'Fallback Name' }));
      globalThis.fetch = stubFetch('Blackout Secure');

      const result = await authorMod.resolveAuthor('auto', { root, environ: AI_ENV });
      assert.equal(result.author, 'Blackout Secure');
      assert.equal(result.source, 'ai:github-models');
    });

    it('falls back to repository signals when the AI answer is unusable', async () => {
      const root = makeRoot();
      write(root, 'package.json', JSON.stringify({ author: 'Fallback Name <https://x.test>' }));
      globalThis.fetch = stubFetch('I am sorry, but I cannot determine the author of this project');

      const result = await authorMod.resolveAuthor('auto', { root, environ: AI_ENV });
      assert.deepEqual(result, { author: 'Fallback Name', source: 'repository-signals' });
    });

    it('resolves offline from package.json', async () => {
      const root = makeRoot();
      write(root, 'package.json', JSON.stringify({ author: { name: 'Grace Hopper' } }));

      const result = await authorMod.resolveAuthor('auto', { root, environ: OFFLINE_ENV });
      assert.deepEqual(result, { author: 'Grace Hopper', source: 'repository-signals' });
    });

    it('falls back to the LICENSE copyright holder', async () => {
      const root = makeRoot();
      write(root, 'LICENSE', 'Copyright (c) 2025-2026 Blackout Secure. All rights reserved.\n');

      const result = await authorMod.resolveAuthor('auto', { root, environ: OFFLINE_ENV });
      assert.deepEqual(result, { author: 'Blackout Secure', source: 'repository-signals' });
    });

    it('falls back to the repository owner when nothing else identifies an author', async () => {
      const result = await authorMod.resolveAuthor('auto', {
        root: makeRoot(),
        environ: OFFLINE_ENV,
      });
      assert.deepEqual(result, { author: 'blackoutsecure', source: 'repository-signals' });
    });

    it('reports unresolved when no signal exists at all', async () => {
      const result = await authorMod.resolveAuthor('auto', { root: makeRoot(), environ: {} });
      assert.deepEqual(result, { author: '', source: 'unresolved' });
    });

    it('never throws when the provider request fails', async () => {
      const root = makeRoot();
      write(root, 'package.json', JSON.stringify({ author: 'Fallback Name' }));
      globalThis.fetch = async () => {
        throw new Error('network down');
      };

      const result = await authorMod.resolveAuthor('auto', { root, environ: AI_ENV });
      assert.deepEqual(result, { author: 'Fallback Name', source: 'repository-signals' });
    });
  });
});
