#!/usr/bin/env node
/**
 * Publishes the packaged .vsix files.
 *
 *   npm run publish:ovsx    Open VSX (Cursor's in-app search)
 *   npm run publish:vsce    VS Code Marketplace (optional)
 *
 * Credentials come from the environment, never from files in this repository:
 *   OVSX_PAT   Open VSX personal access token
 *   VSCE_PAT   Visual Studio Marketplace personal access token
 *
 * Usage: npm run publish:ovsx [-- --locale=zh-cn] [--mode=full] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { p, readJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';

const { flags } = parseArgs();
const config = loadConfig();

const registry = flags.registry === 'vsce' ? 'vsce' : 'ovsx';
const tokenVar = registry === 'vsce' ? 'VSCE_PAT' : 'OVSX_PAT';

if (config.publisher.startsWith('CHANGE-ME')) {
  fail('Set a real "publisher" in config.json, rebuild, then publish.');
}
if (!process.env[tokenVar] && !flags['dry-run']) {
  fail(`${tokenVar} is not set. Export the token in the environment before publishing.`);
}

const summaryFile = p('dist', 'build-summary.json');
if (!fs.existsSync(summaryFile)) fail('dist/build-summary.json not found. Run `npm run package` first.');

const builds = readJson(summaryFile).builds
  .filter((b) => (flags.locale ? (b.locales ?? [b.locale]).includes(flags.locale) : true))
  .filter((b) => (flags.mode ? b.mode === flags.mode : true));
if (!builds.length) fail('No build matched the given filters.');

/** Run the dependency's CLI entry with the current node binary, no shell. */
function nodeBin(pkg, relative) {
  const entry = p('node_modules', ...pkg.split('/'), relative);
  if (!fs.existsSync(entry)) {
    fail(`${pkg} not found at ${path.relative(p('.'), entry)}. Run \`npm install\` first.`);
  }
  return entry;
}

const entry = registry === 'vsce'
  ? nodeBin('@vscode/vsce', 'vsce')
  : nodeBin('ovsx', 'lib/ovsx');

for (const build of builds) {
  const vsix = path.join(p('dist'), `${build.name}-${config.version}.vsix`);
  if (!fs.existsSync(vsix)) fail(`${path.relative(p('.'), vsix)} not found. Run npm run package first.`);

  const args = registry === 'vsce'
    ? ['publish', '--packagePath', vsix]
    : ['publish', vsix];

  if (flags['dry-run']) {
    log.info(`[dry-run] ${registry} ${args.join(' ')}`);
    continue;
  }

  log.info(`${registry} ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit', env: process.env });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`publish failed with code ${result.status}`);
  log.ok(`published ${build.name}`);
}
