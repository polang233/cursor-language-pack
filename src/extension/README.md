Runtime (`main.cjs`) is not ported yet. Copy from kiro-language-pack
`src/extension/main.cjs` in phase 1: language picker + conflict warning.
Rename the settings section `kiroLanguagePack` → `cursorLanguagePack`.
Read `product.json` → `dataFolderName` so argv.json lands in `~/.cursor`.
