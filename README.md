# Humans.txt Generator GitHub Action

Generate a standards-compliant `humans.txt` that credits the people, tools, and technology behind your site. This action is intentionally focused on humans.txt only—no sitemap, robots.txt, or security.txt logic remains.

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
- `humans_output_dir` (default: `dist`): Directory where `humans.txt` is written.
- `humans_filename` (default: `humans.txt`): Output file name.
- `humans_comments` (default: `true`): Include humanstxt.org reference comments.
- `humans_team_name`, `humans_team_title`, `humans_team_contact`, `humans_team_location`: TEAM section fields.
- `humans_thanks_name`, `humans_thanks_url`: THANKS section fields.
- `humans_site_last_update` (default: today in `YYYY/MM/DD`): SITE section last update date.
- `humans_site_standards`, `humans_site_components`, `humans_site_software`, `humans_site_language`, `humans_site_doctype`, `humans_site_ide`: SITE section fields.
- `debug_show_humans` (default: `false`): Print generated content to the log.
- `prefer_company_name` (optional): Displayed in the footer log message.

## Outputs

- `humans_path`: Full path to the generated `humans.txt` file.

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
