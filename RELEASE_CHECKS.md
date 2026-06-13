# Release Checks

Use these commands before packaging desktop builds:

```bash
npm run typecheck
npm run test
npm run verify:quality
npm run verify:release
```

What each script does:

- `npm run typecheck`: runs TypeScript without emitting files
- `npm run test`: runs the React test suite once
- `npm run verify:quality`: runs typecheck, tests, and web build
- `npm run verify:release`: runs the full quality gate plus Electron entry syntax checks

Packaging commands now depend on the release gate:

- `npm run electron:build`
- `npm run package:win`
