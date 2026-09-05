# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## What this is

`bos-humanstxt-generator` is a JavaScript GitHub Action that writes a
[humanstxt.org](https://humanstxt.org)-compliant `humans.txt` crediting the people, tools, and
standards behind a site, then audits the result. Generation assembles the three standard sections —
`/* TEAM */`, `/* THANKS */`, `/* SITE */` — under a generated banner from
[src/lib/project-config.js](src/lib/project-config.js). The audit evaluates 15 deterministic
controls (`HM001`-`HM031`) and emits a console table, a Markdown step summary, SARIF 2.1.0 for code
scanning, a JSON report, a recommendations sidecar, and a skipped-controls sidecar. It is
humans.txt only; no sitemap, robots.txt, or security.txt logic remains in the tree.

Consumers use it as an Action (`uses: blackoutsecure/bos-humanstxt-generator@v1`, inputs in
[action.yml](action.yml)) or as a local CLI (`npx bos-humanstxt validate|generate|audit|sarif` via
the `bin` entry in [package.json](package.json)), which shares every module with the Action so a
dry-run reproduces CI. `bos-automation-hub` supplies organization defaults at
`sync-files/config/humanstxt-generator-global-config.json` — seven rules raised to `fail`,
`fail_on: never`, AI summary off — referenced by the hub's `README.md`, `sync-files/README.md`, and
`scripts/test_universal_config_contract.py`. The hub's
`.github/workflows/deploy-cloudflare-pages.yml` does **not** yet call this action: its
`Generate humans.txt` step emits the file inline from a heredoc, with a comment saying to swap in
this action once it publishes a taggable release the pin bumper can track. The
`bos-securitytxt-generator` step directly above it is already wired and is the shape to adopt.

Stack: Node.js `>=20`, CommonJS, `runs.using: node20` with `main: dist/index.js`. Runtime deps are
`@actions/core` `^1.11.1` and `js-yaml` `^4.3.1`; dev tooling is `@vercel/ncc` `^0.38.1`, `eslint`
`^9.12.0` with `@eslint/js` `^9.39.1`, `prettier` `^3.3.3`, `mocha` `^10.8.2`, `nyc` `^17.1.0`, and
`chai` `^4.5.0` (declared but unused — tests assert with `node:assert`). Version `0.1.0`,
`private: true`; published as a Marketplace Action, not to npm.

## Commands

```bash
npm install                  # `prepare` runs `npm run build`, so this also builds dist/
npm run build                # ncc build src/index.js -o dist  (prebuild runs `validate`)
npm test                     # mocha; `pretest` rebuilds dist/ first
npx mocha test/unit/audit.test.js          # one file
npx mocha --grep 'buildHumansTxt'          # one describe/it
npm run lint:check           # eslint .          (npm run lint adds --fix)
npm run format:check         # prettier --check "**/*.{js,json,md}"
npm run validate             # lint:check + format:check
npm run verify               # validate + test  (alias: npm run check)
npm run coverage             # nyc html + text
npm run clean                # remove dist/ and coverage/
npm run cli -- validate      # node src/cli.js, unbundled
```

## Validating changes

CI is dispatch- and schedule-driven through the single hub-managed workflow
[.github/workflows/bos-universal-gatekeeper-kicker.yml](.github/workflows/bos-universal-gatekeeper-kicker.yml).
There is no `pull_request` trigger and the `push` trigger is scoped to paths this repository does
not have, so routine validation happens locally and on manual dispatch. Job order: `authorize` (the
`bos-workflow-gatekeeper` gate, `contents: read` only) -> `resolve-target-ref` -> `sync-check-dev` /
`sync-check-main` -> `parse-config` (reads `.github/bos-universal-config.json` via the hub's
`universal-config` action) -> `preflight`, then exactly one of `action-test`, `metadata`,
`marketplace-validate`, `marketplace-release`, `release-dev`, or `release-main` per the `operation`
input. Security scanning runs inside `bos-universal-gatekeeper.yml` via `enable_security_scan`.

Locally, narrowest first: `npx mocha test/unit/<the-file-you-touched>.test.js`, then `npm test`, then
`npm run lint:check` and `npm run format:check`, finishing with `npm run build` so the committed
`dist/index.js` matches `src/`. `pretest` already rebuilds, so confirm with `git status` that
`dist/index.js` is unchanged or staged alongside the `src/` change — a `src/` diff without a `dist/`
diff ships old behaviour to consumers.

Update [CHANGELOG.md](CHANGELOG.md) only when its stated policy changes or a major release warrants
promoting it to a real entry log — per that file, per-version detail lives in GitHub Releases and the
README, and patch/minor changes are deliberately not itemised. Update
[MARKETPLACE.md](MARKETPLACE.md) whenever the listing pitch changes (the highlights list or the scope
statement), for example when a new section, audit family, or headline capability lands. Neither
replaces updating the input and output tables in `README.md`.

## Architecture

```text
action.yml                    Manifest: 30 inputs, 15 outputs, node20 -> dist/index.js
dist/index.js                 Committed ncc bundle. Build output, never hand-edited.
src/index.js                  Action entrypoint: inputs -> config -> generate -> audit -> outputs
src/cli.js                    CLI: version | validate | generate | audit | sarif
src/marketplace-config.json   Bundled tier-1 baseline, `require`d so ncc inlines it
src/lib/config.js             Layered loader, schema validation, ConfigError, RULE_DEFAULTS
src/lib/humans-parser.js      buildHumansTxt, parseHumansConfig, parseHumansTxt, parseTeamEntries
src/lib/author.js             `auto` author resolution: AI, then deterministic repo signals
src/lib/audit.js              The 15 HM### controls plus shouldFail
src/lib/findings.js           Finding / AuditResult, rule titles, help URIs, remediations
src/lib/report.js             Console table, step summary, JSON report, recommendations, skips
src/lib/sarif.js              SARIF 2.1.0 emission and merge; drops `skip` findings
src/lib/ai.js                 Provider detection, chat, summarize, deterministic localSummary
src/lib/metadata.js           Package identity, independent of policy config
src/lib/project-config.js     Branding and the generated humans.txt header block
src/lib/output-formatter.js   Console header/footer/section formatting
test/action-humans-generation.test.js  End-to-end: drives dist/index.js via test/event.json
test/unit/*.test.js           audit, author, config, humans-parser, reporting-cli
test/test-config.js           Shared fixtures; test/test-helpers.js sets INPUT_* env
.mocharc.json                 spec `test/**/*.test.js`, bdd, 5000ms timeout, spec reporter
.github/bos-universal-config.json   Repo-owned overrides: managed_file_sync, marketplace
```

Config precedence, lowest to highest: bundled `src/marketplace-config.json` (disable with
`use_marketplace_config: false`) -> the org global file at `global_config_path` (tri-state
`use_global_config`: `auto` loads when present, `true` requires it, `false` disables) -> the repo
file, either `config_path` or the first hit in `DEFAULT_CONFIG_PATHS`
(`.github/bos-universal-config.json` first, `.bos-humanstxt.yml` and friends last) -> a non-empty
action input. Mappings deep-merge; lists and scalars replace. Every tier reads the `humans_txt`
section, or the whole document when that key is absent. Unknown top-level keys are tolerated so
sibling kits can share one universal config, but an unknown key under `audit.rules` is a hard
`ConfigError`. Applied tiers are logged and exposed as `config_sources`.

Section assembly: `parseHumansConfig` turns the single-person `humans_*` inputs into one entry that
`mergeEntries` **prepends** to the roster in `humans_txt.fields.team` / `.thanks` rather than
replacing it. `resolveAuthor` seeds TEAM only when nothing else names one — an explicit value wins
and never leaves the runner, `auto` asks the AI provider using `package.json` `author`, the
`LICENSE`/`NOTICE` copyright holder, the repo owner, and a README excerpt then falls back to those
signals deterministically, and `none`/`off`/`false`/`disabled` skips it. `site.lastUpdate` defaults
to today in `YYYY/MM/DD`. `buildHumansTxt` returns an empty string when there is no content and
comments are disabled, in which case the action warns and writes nothing; otherwise output lands at
`path.join(humans_output_dir, humans_filename)` with a guaranteed trailing newline.

`audit()` re-parses the written bytes, so it sees what a consumer sees. Each rule reads its severity
from `humans_txt.audit.rules.<name>`; a rule set to `skip` still emits a `skip` finding so the report
records it as deliberately not assessed, and no rule defaults to `fail`, so adoption never breaks a
pipeline on day one. `shouldFail` honours `audit_fail_on` (`fail` or `never`). SARIF drops `skip`
findings on purpose, making `skips_json` the only machine-readable record of unassessed controls.
The AI summary is advisory: any failure degrades to `localSummary` rather than failing the run.

Action contract, enumerated in `action.yml` and mirrored in the `README.md` tables. Ten inputs carry
a default — `generate_humans_txt` (`true`), `humans_author` (`auto`), `debug_show_humans` (`false`),
`global_config_path` (`.github/blackout-secure-humanstxt-generator-global-config.yml`),
`use_global_config` (`auto`), `use_marketplace_config` (`true`), `enable_audit` (`true`),
`step_summary` (`true`), `enable_ai_summary` (`true`), `ai_provider` (`auto`). The other twenty
default to empty, meaning "inherit from the cascade": the output-dir and filename knobs,
`humans_comments`, the six `humans_team_*`/`humans_thanks_*` fields, the seven `humans_site_*`
fields, `prefer_company_name`, `config_path`, `audit_fail_on`, and the four report paths
(`sarif_output`, `report_json`, `recommendations_json`, `skips_json`), each disabled while empty.
The fifteen outputs are `humans_path`, `author`, `author_source`, `team_entry_count`,
`config_sources`, `audit_verdict`, the five `audit_*_count` totals, `sarif_path`, `report_json_path`,
`recommendations_json_path`, and `ai_summary`.

`src/` to `dist/`: `dist/index.js` is a committed `@vercel/ncc` bundle produced solely by
`npm run build` (`ncc build src/index.js -o dist`). It is build output — never hand-edit it, never
patch it to fix a bug, and never let a `src/` change ship without a rebuilt `dist/`. `prebuild` gates
the build behind `npm run validate`, `prepare` rebuilds on `npm install`, and `pretest` rebuilds
before `mocha`, so the only real failure mode is committing `src/` without it. The manifest points at
`dist/index.js`, `test/action-humans-generation.test.js` loads it directly and errors telling you to
run `npm run build` if it is missing, and `.github/bos-universal-config.json` lists `dist` in both
`marketplace.allowlist_paths` and `marketplace.required_paths`. It is excluded from Prettier via
`.prettierignore` and from ESLint via the `ignores` block in [eslint.config.js](eslint.config.js).

## Conventions

CommonJS everywhere (`require`/`module.exports`, `sourceType: 'commonjs'` in ESLint); do not
introduce ESM. Every source file opens with an Apache-2.0 SPDX header and a short module docstring
stating the contract and any non-obvious design decision; public functions carry JSDoc. Files are
`kebab-case`, functions and variables `camelCase`, module constants `SCREAMING_SNAKE_CASE` and
usually `Object.freeze`d, rules `HM###`; config keys are `snake_case` on disk, converted by
`camel()` on read. Prettier enforces single quotes, semicolons, trailing commas, 100 columns, LF;
ESLint adds `prefer-const`, `no-var`, and `no-unused-vars` as a warning with an `^_` ignore pattern.
Error handling splits by layer: library code throws `ConfigError` naming the offending key or path;
the Action catches it into `core.setFailed` and wraps every optional artefact write so a reporting
failure becomes `core.warning` rather than a failed run; the CLI returns exit codes instead of
throwing (`0` success, `1` audit failed under the `fail` policy, `2` usage or configuration error);
anything AI-shaped returns `null` on failure instead of raising. Reading inputs is three-valued:
`core.getInput` returns `''` for an unset input, so empty must fall through to the config value
rather than reading as `false` — never write a bare `core.getInput('x') === 'true'`:

```js
function boolInput(name, fallback) {
  const raw = (core.getInput(name) || '').trim();
  if (!raw) return fallback;
  return /^true$/i.test(raw);
}
```

Adding a new option, end to end: declare it in `action.yml` (a real default, or none to inherit);
add the config key, typed accessor, and validation in [src/lib/config.js](src/lib/config.js), plus a
baseline in [src/marketplace-config.json](src/marketplace-config.json) if it needs one; read it in
[src/index.js](src/index.js) through `boolInput`/`core.getInput` so the cascade still applies, and in
[src/cli.js](src/cli.js) if the CLI should expose it; thread it into the generation or audit path;
add a unit test under `test/unit/` and extend the end-to-end test when written output changes;
document it in the `README.md` input or output table; update `MARKETPLACE.md` if it is a headline
capability and `CHANGELOG.md` only per that file's policy; then run `npm run build` and commit the
regenerated `dist/index.js` in the same change. A new audit rule additionally needs entries in
`RULE_DEFAULTS`, `RULE_TITLES`, `RULE_HELP`, and `DEFAULT_REMEDIATIONS`, under a family prefix
already covered by `RULE_FAMILIES`.

## Blackout Secure conventions

These apply to every repository in the `blackoutsecure` organization.

### Branch model

- `dev` is the default branch and where all work lands.
- `main` is the promoted stable runtime that consumers reference through `@main`.
- Version tags (`vX.Y.Z` and a floating `vX`) point at promoted runtime commits.
- Promotion is driven from `bos-automation-hub` (`release-promote.yml`). Do not push
  directly to `main` and do not move tags by hand.

### Centrally managed files - do not hand-edit here

`blackoutsecure/bos-automation-hub` distributes these through
`bos-managed-file-sync-action`. Change the source under the hub's `sync-files/`, never the
copy in this repository:

- `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`
- `.github/FUNDING.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`
- `.github/workflows/bos-universal-gatekeeper-kicker.yml`
- the `# >>> managed-file-sync:<service> >>> ... # <<< managed-file-sync:<service> <<<`
  delimited blocks inside `.editorconfig`, `.markdownlint.yaml`, `.shellcheckrc`,
  `.yamllint.yml`, `.gitignore`, and `README.md`

`.github/bos-universal-config.json` is repo-owned. It holds this repository's overrides on
top of the hub's global config and is the right place to change gate behaviour.

### CI gate

Pushes and pull requests run the hub's reusable `bos-universal-security.yml`, reported as a
single required check. It runs markdownlint, yamllint, shellcheck, and actionlint; ESLint,
Prettier, Ruff, pytest, and Bats where the repository has them; `bos-code-scanning-kit`
(secret scan, SAST, GHAS posture) and CodeQL; dependency review; and compliance checks for
the canonical README header and a conventional-commit PR title
(`feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert: subject`).

Every `uses:` reference in a workflow must be a commit SHA with a trailing version comment,
for example `actions/checkout@<sha> # v4.2.2`.

## Boundaries

### Always

- Rebuild `dist/` with `npm run build` and commit it in the same change as any `src/` edit.
- Run `npm test`, `npm run lint:check`, and `npm run format:check` before finishing.
- Add a unit test under `test/unit/` for every new rule, config key, or parser branch, and extend
  `test/action-humans-generation.test.js` when the written file changes.
- Keep an empty input meaning "inherit from the config cascade", never "false".
- Keep the audit deterministic and the AI summary advisory, degrading to `localSummary`.
- Keep the `README.md` input and output tables in step with `action.yml`.

### Ask first

- Renaming, removing, or re-defaulting an `action.yml` input or output, or changing an output's
  format — this is published Marketplace surface.
- Changing config tier precedence, `DEFAULT_CONFIG_PATHS`, `CONFIG_SECTION`, or the
  `use_global_config` tri-state.
- Renaming or renumbering an `HM###` rule, or raising a default severity to `fail`.
- Changing the generated banner in `src/lib/project-config.js`, the SARIF tool name, or the
  decision to drop `skip` findings from SARIF.
- Adding a runtime dependency, a new network call, or a new AI provider path.
- Editing `marketplace.allowlist_paths`, `blocked_paths`, or `required_paths` in
  `.github/bos-universal-config.json`.

### Never

- Never hand-edit `dist/index.js`; it is generated by `ncc` and overwritten by every build.
- Never commit secrets, tokens, API keys, or a real `humans.txt` containing them.
- Never publish real personal contact details of contributors without their consent — treat
  `humans_team_contact`, `fields.team[].contact`, and anything the `auto` author resolver returns
  as personal data, and prefer a handle or a contact form over a plaintext address.
- Never hand-edit centrally managed files or content between managed-file-sync markers.
- Never use an unpinned `uses:` ref; every reference is a 40-character commit SHA with a trailing
  version comment.
- Never push directly to `main` or move a version tag by hand; promotion runs from the hub.
- Never weaken a rule severity, disable the audit, or set `fail_on: never` to get a green run.
