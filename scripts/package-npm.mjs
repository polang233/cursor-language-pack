#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { p, readJson, writeJson } from './lib/util.mjs';
import { nodeScript, npmCommand } from './lib/npm-tooling.mjs';

fs.rmSync(p('dist', 'npm-package.json'), { force: true });
nodeScript(p('scripts', 'prepare-npm.mjs'), [], { cwd: p('.'), stdio: 'inherit' });
const result = npmCommand(['pack', '--ignore-scripts', '--json', '--pack-destination', p('dist')], { cwd: p('.') });
const [pack] = JSON.parse(result.stdout);
const pkg = readJson(p('package.json'));
if (pack.name !== pkg.name || pack.version !== pkg.version) throw new Error('npm packed the wrong package/version.');
const files = pack.files.map((file) => file.path);
for (const required of ['bin/cli.mjs', 'scripts/lib/cli.mjs', 'scripts/lib/system-locale.mjs',
  'src/extension/main.cjs', 'assets/language-pack.vsix', 'config.json', 'LICENSE', 'NOTICE']) {
  if (!files.includes(required)) throw new Error(`npm tarball is missing ${required}`);
}
if (pkg.name.endsWith('/cursor-language-pack')) {
  const config = readJson(p('config.json'));
  const dictionaries = config.locales.filter(locale => locale.enabled !== false)
    .flatMap(locale => ['hardcoded.json', 'commerce.json'].map(name => `src/i18n/${locale.id}/${name}`));
  for (const required of ['scripts/lib/commerce-i18n.mjs', ...dictionaries]) {
    if (!files.includes(required)) throw new Error(`npm tarball is missing ${required}`);
  }
}
if (files.some((file) => /^(?:node_modules|upstream|metadata|reports|\.github|\.cursor|\.rtk)\//.test(file)
    || /(?:^|\/)\.env(?:\.|$)/.test(file) || file.endsWith('.tgz') || /^(?:CLAUDE|AGENTS)\.md$/.test(file))) {
  throw new Error('npm tarball contains development-only files.');
}
if (files.filter((file) => file.endsWith('.vsix')).length !== 1) throw new Error('npm tarball must contain exactly one VSIX.');
const tarball = p('dist', pack.filename);
nodeScript(p('scripts', 'test-package.mjs'), [`--tarball=${tarball}`], { cwd: p('.'), stdio: 'inherit' });
writeJson(p('dist', 'npm-package.json'), {
  name: pack.name, version: pack.version, filename: pack.filename,
  integrity: pack.integrity, size: pack.size, unpackedSize: pack.unpackedSize, files
});
console.log(`Validated npm package: ${path.relative(p('.'), tarball)} (${Math.round(fs.statSync(tarball).size / 1024)} KiB)`);
