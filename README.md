# Humans.txt Generator GitHub Action

Generate a standards-compliant `humans.txt` that credits the people, tools, and technology behind your site. This action is intentionally focused on humans.txt only—no sitemap, robots.txt, or security.txt logic remains.

## Features

✅ **humanstxt.org compliant** — TEAM, THANKS, and SITE sections in the conventional layout  
✅ **Multi-person rosters** — credit an entire team, not just one person  
✅ **Layered configuration** — bundled marketplace baseline → org global config → repo config → action inputs  
✅ **Compliance audit** — 15 evidence-based controls with per-rule `fail`/`warn`/`skip` severities  
✅ **Enterprise reporting** — Markdown step summary, SARIF 2.1.0 for code scanning, JSON report, recommendations sidecar  
✅ **AI findings summary** — optional GitHub Models summary with a deterministic local fallback  
✅ **Local CLI** — `bos-humanstxt validate|generate|audit|sarif` reproduces CI output on your machine

## Quick Start

```yaml
name: Humans
on:
  push:
    branches: [main]

jobs:
  humans:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate humans.txt
        uses: blackoutsecure/bos-humanstxt-generator@v1
        with:
          humans_output_dir: dist
          humans_team_name: 'Example Inc.'
          humans_team_title: 'Engineering'
          humans_team_contact: 'engineering@example.com'
          humans_site_standards: 'HTML5, CSS3'
          humans_site_software: 'Node.js, Vite'

      - name: Upload humans.txt
        uses: actions/upload-artifact@v4
        with:
          name: humans-txt
          path: dist/humans.txt
          if-no-files-found: error
```

## Inputs

- `generate_humans_txt` (default: `true`): Toggle generation.
- `humans_output_dir`: Directory where `humans.txt` is written. Empty uses `humans_txt.generate.output_dir` from config (default `dist`).
- `humans_filename`: Output file name. Empty uses `humans_txt.generate.filename` from config (default `humans.txt`).
- `humans_comments`: Include humanstxt.org reference comments. Empty uses config (default `true`).
- `humans_author` (default: `auto`): Author credited in the TEAM section. `auto` asks the AI provider to identify the author from `package.json`, `LICENSE`/`NOTICE`, the README, and the repository owner, then falls back to those same signals when no provider is available. Set an explicit name to skip AI entirely, or `none` to disable. Only applied when no other TEAM name is supplied.
- `humans_team_name`, `humans_team_title`, `humans_team_contact`, `humans_team_location`: TEAM section fields. This single entry is **prepended** to any roster declared in config.
- `humans_thanks_name`, `humans_thanks_url`: THANKS section fields, prepended the same way.
- `humans_site_last_update` (default: today in `YYYY/MM/DD`): SITE section last update date.
- `humans_site_standards`, `humans_site_components`, `humans_site_software`, `humans_site_language`, `humans_site_doctype`, `humans_site_ide`: SITE section fields.
- `debug_show_humans` (default: `false`): Print generated content to the log.
- `prefer_company_name` (optional): Displayed in the footer log message.

### Configuration, Audit & Reporting Inputs

| Input                    | Description                                              | Default                                                         |
| ------------------------ | -------------------------------------------------------- | --------------------------------------------------------------- |
| `config_path`            | Explicit repository config file                          | auto-discover                                                   |
| `global_config_path`     | Organization-level global config                         | `.github/blackout-secure-humanstxt-generator-global-config.yml` |
| `use_global_config`      | Global tier: `auto`, `true` (require), `false` (disable) | `auto`                                                          |
| `use_marketplace_config` | Apply the bundled marketplace baseline                   | `true`                                                          |
| `enable_audit`           | Run the humanstxt.org compliance audit                   | `true`                                                          |
| `audit_fail_on`          | `fail` or `never`; empty uses `humans_txt.audit.fail_on` | from config                                                     |
| `sarif_output`           | Write SARIF 2.1.0 for GitHub code scanning               | disabled                                                        |
| `report_json`            | Write the machine-readable JSON audit report             | disabled                                                        |
| `recommendations_json`   | Write structured remediation recommendations             | disabled                                                        |
| `skips_json`             | Write the skipped-controls sidecar                       | disabled                                                        |
| `step_summary`           | Append the Markdown report to `$GITHUB_STEP_SUMMARY`     | `true`                                                          |
| `enable_ai_summary`      | Generate a natural-language findings summary             | `true`                                                          |
| `ai_provider`            | `auto`, `none`, or a named provider                      | `auto`                                                          |

## Outputs

| Output                      | Description                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `humans_path`               | Full path to the generated `humans.txt` file                                       |
| `author`                    | Author credited in the TEAM section, after `auto` resolution                       |
| `author_source`             | `explicit`, `ai:<provider>`, `repository-signals`, `unresolved`, or `disabled`     |
| `team_entry_count`          | Number of TEAM entries written                                                     |
| `config_sources`            | Applied config tiers, in precedence order                                          |
| `audit_verdict`             | `Pass`, `Review recommended`, `Action required`, `Inconclusive`, or `Not assessed` |
| `audit_pass_count`          | Controls that passed                                                               |
| `audit_warn_count`          | Controls that warned                                                               |
| `audit_fail_count`          | Controls that failed                                                               |
| `audit_error_count`         | Controls that could not be evaluated                                               |
| `audit_skip_count`          | Controls that were not assessed                                                    |
| `sarif_path`                | Written SARIF file, when `sarif_output` is set                                     |
| `report_json_path`          | Written JSON report, when `report_json` is set                                     |
| `recommendations_json_path` | Written recommendations sidecar, when `recommendations_json` is set                |
| `ai_summary`                | Short natural-language summary of the audit findings                               |

## 🗂️ Layered Configuration

Configuration is deep-merged, then validated. Precedence, lowest to highest:

1. **Bundled marketplace baseline** — `src/marketplace-config.json`, shipped with the action
2. **Organization global config** — `.github/blackout-secure-humanstxt-generator-global-config.yml`
3. **Repository config** — first match of `.github/bos-universal-config.json|yml|yaml`, `bos-universal-config.*`, or `.bos-humanstxt.yml|yaml`
4. **Action inputs** — any input you explicitly set wins over every config tier

Unknown top-level keys are ignored so the same `bos-universal-config.json` can be shared
with other Blackout Secure kits. Unknown keys **inside** `humans_txt.audit.rules`, or an
unknown field on a team/thanks/site entry, are rejected so a typo fails fast.

Config is also the only way to credit **more than one person** — the action inputs describe
a single entry, which is prepended to the configured roster.

```yaml
# .github/bos-universal-config.json (YAML shown for readability)
humans_txt:
  owner: blackoutsecure
  # `auto` (default) resolves the author via AI, then repository signals.
  # An explicit name skips AI; `none` disables the credit entirely.
  author: auto

  generate:
    include_comments: true
    filename: humans.txt
    output_dir: dist

  fields:
    team:
      - name: Ada Lovelace
        title: Principal Engineer
        contact: https://example.org/contact
        location: Remote
      - name: Grace Hopper
        title: Architect
    thanks:
      - name: Open Source
        url: https://opensource.org
    site:
      standards: HTML5, CSS3
      components: Astro
      software: Node.js, Vite
      last_update: 2026/05/01

  audit:
    enable: true
    fail_on: fail # or `never` to keep the audit advisory
    max_size_kb: 16
    max_age_days: 365
    rules:
      require_team_section: fail
      require_html_link: warn

  reporting:
    step_summary: true
    sarif: true
    json_report: true
    recommendations: true

  remediation:
    enable_ai_findings_summary: true
    ai_findings_summary_provider: auto
    local_heuristic_fallback: true
```

## 👥 humans.txt Compliance Audit

Every control is evidence-based and configurable through `humans_txt.audit.rules.<name>`.
A rule set to `skip` still emits a finding, so the report records that the control was
deliberately not assessed.

| Rule    | Config key                  | Checks                                                  | Default |
| ------- | --------------------------- | ------------------------------------------------------- | ------- |
| `HM001` | `require_team_section`      | A TEAM section is present                               | `warn`  |
| `HM002` | `require_site_section`      | A SITE section is present                               | `warn`  |
| `HM003` | `require_thanks_section`    | A THANKS section is present                             | `skip`  |
| `HM004` | `require_team_contact`      | At least one team entry carries a Contact               | `warn`  |
| `HM010` | `require_https_urls`        | No URL uses insecure `http://`                          | `warn`  |
| `HM011` | `valid_last_update`         | `Last update` is a `YYYY/MM/DD` date                    | `warn`  |
| `HM012` | `last_update_freshness`     | `Last update` is within `audit.max_age_days`            | `warn`  |
| `HM013` | `forbid_placeholder_values` | No TODO/`example.com`/`Your Name` template text remains | `warn`  |
| `HM014` | `forbid_email_addresses`    | No plaintext email addresses are published              | `skip`  |
| `HM015` | `no_duplicate_team_entries` | No team name appears twice                              | `warn`  |
| `HM020` | `site_root_location`        | File is written to the published site root              | `warn`  |
| `HM021` | `file_size_limit`           | File stays within `audit.max_size_kb`                   | `warn`  |
| `HM022` | `require_html_link`         | An HTML page declares `<link rel="author">`             | `skip`  |
| `HM030` | `require_utf8_no_bom`       | UTF-8 encoded without a byte-order mark                 | `warn`  |
| `HM031` | `valid_section_syntax`      | Every content line sits under a section banner          | `warn`  |

No rule defaults to `fail`, so adopting the audit never breaks an existing pipeline on
day one. Opt individual rules up to `fail` once your file is clean.

### Reporting example

```yaml
- name: Generate and audit humans.txt
  id: humanstxt
  uses: blackoutsecure/bos-humanstxt-generator@v1
  with:
    humans_output_dir: dist
    humans_team_name: 'Example Inc.'
    sarif_output: 'humanstxt-audit.sarif'
    report_json: 'humanstxt-audit.json'
    audit_fail_on: 'never'

- name: Upload audit findings to code scanning
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: humanstxt-audit.sarif

- run: echo "Verdict: ${{ steps.humanstxt.outputs.audit_verdict }}"
```

`skip` findings are intentionally omitted from SARIF — they would clutter the Security
tab with controls that were never assessed. Use `skips_json` when you need that record.

## 🤖 AI Findings Summary

When `enable_ai_summary` is on, the action asks a model for a three-bullet triage summary
of the non-passing findings and appends it to the step summary and JSON report.

- `ai_provider: auto` (default) uses **GitHub Models** whenever `GITHUB_MODELS_TOKEN` or
  `GITHUB_TOKEN` is exposed to the job. Grant `models: read` in the job permissions.
- `ai_provider: none` disables the model call.
- Any other name uses `<NAME>_API_KEY` plus `<NAME>_API_ENDPOINT` from the environment.

AI is never on the critical path: any missing credential, authorization failure, timeout,
or transport error falls back to a deterministic local summary, and the run continues.

## 🖥️ Local CLI

The CLI shares every module with the Action, so a local dry-run produces the same report
as CI — including auditing a `humans.txt` this action did not generate.

```bash
npm install

# Resolve and print the merged configuration cascade
npx bos-humanstxt validate

# Write humans.txt from the resolved configuration
npx bos-humanstxt generate --output-dir dist

# Audit any existing humans.txt and write every report artefact
npx bos-humanstxt audit \
  --output-dir dist \
  --sarif humanstxt-audit.sarif \
  --json humanstxt-audit.json \
  --recommendations humanstxt-recommendations.json \
  --fail-on never

# Merge SARIF logs before a single code-scanning upload
npx bos-humanstxt sarif --input a.sarif --input b.sarif --output merged.sarif
```

Exit codes: `0` success, `1` audit failed under the `fail` policy, `2` usage or
configuration error.

## What gets generated

The action produces a `humans.txt` file that follows the [humanstxt.org](https://humanstxt.org) convention. Sections are included only when the related inputs are provided. A default header is added when `humans_comments` is true. If no content is supplied and comments are disabled, the action will skip writing the file and warn.

## Local development

- `npm install` — install dependencies.
- `npm run build` — bundle the action to `dist/` with `@vercel/ncc`.
- `npm test` — run the humans-only test suite (builds first via `pretest`).
- `npm run lint` / `npm run format` — lint or format the codebase.
- `npm run clean` — remove `dist/` and coverage artifacts.

Commit the `dist/` folder when publishing a new release tag so consumers can use the action without installing dependencies.

## License

Apache-2.0

<!-- >>> managed-file-sync:security_readme_pointer >>> -->
## Security & secrets

This repository is built with Blackout Secure's reusable GitHub Actions
workflows. If you fork or self-host these workflows and need to provision
your own credentials (GitHub App vs. PAT guidance, secret tiers, Docker
Hub/Cloudflare/Balena setup walkthroughs), see the
["Secrets pipelining strategy"](https://github.com/blackoutsecure/bos-automation-hub#secrets-pipelining-strategy)
section of `bos-automation-hub`. To report a vulnerability, see
[SECURITY.md](https://github.com/blackoutsecure/.github/blob/main/SECURITY.md).
<!-- <<< managed-file-sync:security_readme_pointer <<< -->
