#!/usr/bin/env node
/**
 * Packages every directory produced by `npm run build` into a .vsix.
 *
 * Usage: npm run package [-- --locale=zh-cn] [--mode=cursor] [--skip-build]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { p, readJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';

const { flags } = parseArgs();
const config = loadConfig();

/**
 * Resolve a dependency's CLI entry point so it can be run with the current node
 * binary. Spawning the .cmd shim on Windows would require `shell: true`, which
 * concatenates arguments unescaped.
 */
function nodeBin(pkg, relative) {
  const entry = p('node_modules', ...pkg.split('/'), relative);
  if (!fs.existsSync(entry)) {
    fail(`${pkg} not found at ${path.relative(p('.'), entry)}. Run \`npm install\` first.`);
  }
  return entry;
}

function run(entry, args, cwd, label = path.basename(entry)) {
  log.info(`${label} ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [entry, ...args], { cwd, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${label} exited with code ${result.status}`);
}

if (!flags['skip-build']) {
  const args = [];
  if (flags.locale) args.push(`--locale=${flags.locale}`);
  if (flags.mode) args.push(`--mode=${flags.mode}`);
  run(p('scripts', 'build.mjs'), args, p('.'), 'build');
}

const summaryFile = p('dist', 'build-summary.json');
if (!fs.existsSync(summaryFile)) fail('dist/build-summary.json not found. Run `npm run build` first.');

const builds = readJson(summaryFile).builds
  .filter((b) => (flags.locale ? (b.locales ?? [b.locale]).includes(flags.locale) : true))
  .filter((b) => (flags.mode ? b.mode === flags.mode : true));
if (!builds.length) fail('No build matched the given filters.');

const vsce = nodeBin('@vscode/vsce', 'vsce');
const artifacts = [];

for (const build of builds) {
  const dir = p('dist', build.name);
  if (!fs.existsSync(path.join(dir, 'package.json'))) fail(`${build.name}: missing manifest, re-run npm run build.`);

  const outFile = path.join(p('dist'), `${build.name}-${config.version}.vsix`);
  // Language packs ship no code and no dependencies; the repository field is
  // filled from config.json but may still be a placeholder during development.
  run(vsce, [
    'package',
    '--no-dependencies',
    '--allow-missing-repository',
    '--out', outFile
  ], dir, 'vsce');

  if (!fs.existsSync(outFile)) fail(`${build.name}: vsce reported success but ${outFile} is missing.`);
  artifacts.push(outFile);
}

log.step('Artifacts');
for (const file of artifacts) {
  log.ok(`${path.relative(p('.'), file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KiB`);
}
log.plain('\nInstall locally with: Command Palette -> Extensions: Install from VSIX...');
