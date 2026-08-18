# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

The version number tracks the language pack itself, not the Cursor release it
targets. Verified Cursor versions will be listed in `config.json` under
`target.verifiedCursorVersions`.

## [Unreleased]

### Added

- Repository scaffold: docs, `config.json`, glossaries, and `npm run detect`
  against a local Cursor install.
- Probe snapshot: Cursor **3.16.17** (Code OSS **1.128.0**). NLS layout is
  `nls.keys.json` + `nls.messages.json`. Cursor-authored core keys: **34 modules /
  231 keys**, reachable via a language pack that owns the `vscode` translation
  id. Overlay UI (Settings / Agent / Chat) is not. This machine already has
  `MS-CEINTL.vscode-language-pack-zh-hans` 1.128.0 installed. See
  [docs/research.md](docs/research.md).
