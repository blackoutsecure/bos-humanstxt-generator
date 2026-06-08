# Security Policy

## Supported Versions

We support the latest major release tag (e.g. `v1`) and the most recent patch versions. Older tags may receive critical fixes only.

## Reporting a Vulnerability

Please use GitHub Security Advisories ("Report a vulnerability" button in the repository) for confidential disclosure. Provide:

- Affected version/tag
- Description of the issue and potential impact
- Steps to reproduce (minimal example)
- Suggested fix (if available)

Do NOT open a public issue for sensitive security problems.

## Response Process

1. Triage within 5 business days.
2. Reproduce and assess severity.
3. Patch and create a prerelease for validation if needed.
4. Publish fixed tag and coordinated security advisory.

## Scope

This action processes local repository files only. It does not make external network calls beyond GitHub APIs used by Actions runtime.

## Safe Handling Recommendations

- Pin a major or exact version to avoid unexpected changes.
- Review generated humans.txt output before publishing; avoid sharing private contact details.
- Keep repository secrets and credentials out of any inputs that surface in humans.txt.

## Preferred Contact

If GitHub advisories are not available, open an issue with the prefix `[SECURITY]` requesting a private communication channel.
