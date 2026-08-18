/**
 * One-shot: copy zh-cn i18n sources to zh-tw via OpenCC (cn → twp) plus Taiwan product terms.
 * Usage: node scripts/convert-zh-tw.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenCC from 'opencc-js';
import { p } from './lib/util.mjs';

const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
const srcRoot = p('src', 'i18n', 'zh-cn');
const dstRoot = p('src', 'i18n', 'zh-tw');

const overlays = [
  [/許可權/g, '權限']
];

function convertText(text) {
  let out = converter(text);
  for (const [re, rep] of overlays) out = out.replace(re, rep);
  out = out.replace(/（）/g, '').replace(/\(\)/g, '');
  out = out.replace('"locale": "zh-cn"', '"locale": "zh-tw"');
  out = out.replace(
    'Terminology contract for zh-cn',
    'Terminology contract for zh-tw (from zh-cn + Taiwan phrasing)'
  );
  out = out.replace(
    'Simplified Chinese translations',
    'Traditional Chinese (Taiwan) translations'
  );
  return out;
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, files);
    else if (ent.name.endsWith('.json')) files.push(full);
  }
  return files;
}

const files = walk(srcRoot);
for (const src of files) {
  const rel = path.relative(srcRoot, src);
  const dst = path.join(dstRoot, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, convertText(fs.readFileSync(src, 'utf8')), 'utf8');
  console.log('wrote', path.relative(p('.'), dst));
}
console.log(`done: ${files.length} file(s)`);
