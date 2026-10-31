# Changelog

## 1.1.3 — 2026-10-31

- Require a matching current-version entry in `extensions.json` and the registered extension's manifest before treating the language pack as installed. Leftover files after uninstall no longer satisfy this check.
- Verify extension registration after the Cursor CLI exits successfully. Report an incomplete installation with exit code 1 and preserve existing language packs when verification fails.

- Follow custom extension directories selected by VSCODE_EXTENSIONS or VSCODE_PORTABLE when verifying installation.

## 1.1.2 — 2026-10-29

- Include the merged installer fix: ignore ordinary files in the extensions directory and explain macOS App Management write failures.
- Verify Cursor 3.27.22 against 3.27.12. Core and built-in localization resources are unchanged; maintained hardcoded and commerce translations pass real-bundle checks.

## 1.1.1 — 2026-10-25

- Replace first-publication notices with working npm instructions and document both locale overrides.
- Add public-registry and actual npx installation checks for automatic locale selection, manual language switching and restore.
- Enable the authorized GitHub Actions trusted publisher and verify public npx installs on Windows, macOS and Linux after each npm release.

## 1.1.0 — 2026-10-25

- Make all built-in manifest translations available in both locales by correcting package override sections and restoring filtered TypeScript/authentication messages. Correct the OCaml labels copied from Julia in Cursor.
- Validate authored manifest overrides in generated builds and the VSIX inside the npm tarball.

- Adapt translations to Cursor 3.27.12. Add 15 localized strings for attachments, queued messages, managed deployments and named reconnection errors in Simplified and Traditional Chinese.
- Fill hardcoded UI gaps in queued-message controls, voice settings, network diagnostics, private inference and computer access.
- Translate the credits and top-up interface through its translation resources, retaining the original message keys and amount placeholders.
- Extend upgrade checks to detect English text changes, module moves and built-in extension string changes, and retain the previous metadata baseline for review.
- Add `@polang233/cursor-language-pack` for one-command installation, with the matching VSIX bundled in the npm package.
- Choose Simplified or Traditional Chinese from the system language, with `--locale` overrides.
- Support preview, status, repeated installation, language switching and restoring application files from backups in the user profile.
- Build and test npm and VSIX artifacts together. npm publication is disabled until the publisher is configured.
