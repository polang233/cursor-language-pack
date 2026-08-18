Cursor-authored NLS translations go here once `extract` / `gap` exist.

Split by area so a 200-key dump is reviewable, same as kiro-language-pack:

- `core.composer.i18n.json`
- `core.agents.i18n.json`
- `core.settings.i18n.json`   (aiSettings + aiConfig)
- `core.cursor.i18n.json`     (blame, origin, auth, leftover)

Any file named `core*.i18n.json` under this folder will merge into the `vscode`
translation id.
