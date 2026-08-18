import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Resolve a path relative to the repository root. */
export const p = (...segments) => path.join(ROOT, ...segments);

export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(stripJsonComments(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (fallback !== undefined) return fallback;
      throw new Error(`File not found: ${file}`);
    }
    throw new Error(`Failed to parse JSON: ${file}\n${err.message}`);
  }
}

export function writeJson(file, data, { pretty = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0) + '\n', 'utf8');
}

/**
 * VS Code allows comments in product.json and argv.json, and this project allows
 * them in config.json and in translation sources. Only comments outside string
 * literals are removed.
 */
export function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (c === '\n') { inLineComment = false; out += c; }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    out += c;
  }
  return out;
}

const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (USE_COLOR ? `\u001b[${code}m${s}\u001b[0m` : s);

export const log = {
  info: (...a) => console.log(paint(36, '·'), ...a),
  ok: (...a) => console.log(paint(32, '+'), ...a),
  warn: (...a) => console.warn(paint(33, '!'), ...a),
  err: (...a) => console.error(paint(31, 'x'), ...a),
  step: (title) => console.log('\n' + paint(1, title)),
  plain: (...a) => console.log(...a)
};

export function fail(message) {
  log.err(message);
  process.exit(1);
}

export function loadConfig() {
  return readJson(p('config.json'));
}

/** Minimal `--flag`, `--key=value` and positional argument parser. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value === undefined ? true : value === 'false' ? false : value;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}
