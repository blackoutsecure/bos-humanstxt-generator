# Contributing

Thank you for considering a contribution!

## Workflow Overview

1. Fork the repository and create a topic branch: `git checkout -b feat/your-feature`.
2. Install dependencies: `npm install`.
3. Make changes (add inputs? update `action.yml`, implement logic in `src/index.js`).
4. Build: `npm run build` (updates `dist/`).
5. Run quality checks:

```bash
npm run lint
npm test
npm run coverage
```

6. Update documentation (`README.md`) if you add or change inputs.
7. Commit using conventional style (examples below).
8. Push and open a Pull Request.

## Conventional Commit Examples

- `feat: add humans_site_language input`
- `fix: ensure comments toggle off header`
- `docs: update quick start example`
- `refactor: simplify output logging`
- `chore: update dev dependencies`

## Testing Guidelines

- Unit tests: add in `test/unit/` for pure functions like the humans parser.
- Integration tests: extend `test/action-humans-generation.test.js` for end-to-end scenarios.
- Keep tests small and focused; prefer readability over exhaustive logging.

## Adding a New Input

1. Add input definition to `action.yml`.
2. Handle it in `src/index.js` (parse from `core.getInput`).
3. Add unit tests if logic isolated; integration test if affects full run.
4. Document in README (Inputs section + example workflow).
5. Rebuild `dist/` (`npm run build`).

## Release Process

Releases are performed via the `Release` workflow:

- Provide a semantic version (e.g. `v1.2.0`).
- Workflow builds, commits dist (if changed), creates annotated tag, updates moving major tag.
- GitHub Release generated with notes.

Do not manually push tags without running the workflow (ensures consistent build artifact).

## Code Style

- ESLint + Prettier enforce formatting.
- Keep test data minimal and inline unless reuse is clear.
- Keep functions small and focused.

## Security

See `SECURITY.md` for reporting instructions.

## Need Help?

Open a draft PR early for feedback or create an issue describing the proposal.
