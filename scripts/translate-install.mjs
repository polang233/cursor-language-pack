#!/usr/bin/env node
/**
 * Rewrite hardcoded UI text inside a local Cursor install.
 *
 * The language pack covers strings Cursor registered with VS Code. Settings,
 * the Agent window and the account page also ship English literals in the
 * workbench bundles. This replaces those literals when they are the value of
 * a UI field, then installs the pack and sets the display language.
 *
 *   npm run translate
 *   npm run translate -- --locale=zh-tw
 *   npm run translate -- --preview
 *   npm run translate -- --undo
 *   npm run translate -- --dir="D:\cursor"
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Module from 'node:module';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { p, readJson, writeJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';
import { findCursorInstalls, readCursorInfo, extensionsDir, argvJsonPath } from './lib/cursor-paths.mjs';

const BUNDLES = [
  'out/vs/workbench/workbench.desktop.main.js',
  'out/vs/workbench/workbench.glass.main.js',
  'out/vs/workbench/workbench.anysphere-ui-automations.js'
];

/** Only these fields are shown to the user. Anything else is left alone. */
const UI_FIELDS = [
  'label', 'description', 'placeholder', 'accessibleLabel', 'ariaLabel', 'tooltip',
  'subtitle', 'buttonLabel', 'emptyLabel', 'emptyText', 'heading',
  'confirmText', 'title', 'children'
];

const FIELD_RE = new RegExp(
  `\\b(${UI_FIELDS.join('|')})\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
  'g'
);

const { flags } = parseArgs();
const config = loadConfig();

function unescapeJs(raw) {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, token) => {
    if (token.startsWith('u')) return String.fromCharCode(Number.parseInt(token.slice(1), 16));
    return { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[token] ?? token;
  });
}

function escapeJs(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function translateLiteral(raw, dict, hits) {
  const english = unescapeJs(raw);
  if (!Object.prototype.hasOwnProperty.call(dict, english)) return null;
  const translated = dict[english];
  if (typeof translated !== 'string' || translated === english) return null;
  hits.set(english, (hits.get(english) || 0) + 1);
  return escapeJs(translated);
}

/**
 * Cursor Settings sidebar titles, keyed by the internal id.
 * Only this exact English value is replaced. The same id is reused for icons,
 * colors and abbreviation tables (`mcp:"MCP"`), and those must stay as they are.
 */
const SIDEBAR_ENGLISH = {
  general: 'General',
  profile: 'Profile',
  'vscode-settings': 'VS Code Settings',
  appearance: 'Appearance',
  fun: 'Fun',
  'plan-usage': 'Plan & Usage',
  chat: 'Agents',
  browser: 'Browser & Network',
  tab: 'Tab',
  models: 'Models',
  'git-prs': 'Git & PRs',
  rules: 'Rules, Skills, Subagents',
  plugins: 'Plugins',
  customize: 'Customize',
  indexing: 'Indexing',
  mcp: 'Tools & MCPs',
  hooks: 'Hooks',
  beta: 'Beta',
  network: 'Network',
  'background-composer': 'Cloud Agents',
  'grok-bot': 'Grok Bot',
  'self-driving': 'Self-Driving PRs',
  worktrees: 'Worktrees',
  developer: 'Developer'
};

/** Composer mode names, one object, same text in the desktop and glass bundles. */
const MODE_FROM = 'agent:"Agent",chat:"Chat",background:"Cloud",plan:"Plan",spec:"Spec",debug:"Debug",triage:"Triage"';
const MODE_PARTS = [
  ['agent', 'Agent'],
  ['chat', 'Chat'],
  ['background', 'Cloud'],
  ['plan', 'Plan'],
  ['spec', 'Spec'],
  ['debug', 'Debug'],
  ['triage', 'Triage']
];

/** Quoted literals that are shown as-is, not as a `label:` / `title:` field. */
const BARE_LABELS = [
  'Rules, Skills, Subagents',
  'Code Intelligence',
  'Indexing',
  'Privacy Mode',
  'Privacy Mode (Legacy)',
  'Switch to Agents Window',
  'Try it now',
  'Run many agents in parallel \u2014 across repos, locally, on remote SSH, and in the cloud.',
  'System Tray Icon',
  'Show Cursor in system tray',
  'Menu Bar Icon',
  'Show Cursor in menu bar'
];

const NAV_RE = /(?:"([A-Za-z0-9-]+)"|([A-Za-z_$][\w$]*)):"((?:\\.|[^"\\])*)"/g;

/**
 * Replace a translation only when the English text is the entire value of a
 * UI field (`label:"…"`, `title:"…"`, …) or a Cursor Settings sidebar name.
 * A word inside a longer string, a search keyword, or an id is left alone.
 */
export function rewrite(source, dict) {
  FIELD_RE.lastIndex = 0;
  const hits = new Map();
  let count = 0;
  let text = source.replace(FIELD_RE, (full, field, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `${field}:"${translated}"`;
  });

  NAV_RE.lastIndex = 0;
  text = text.replace(NAV_RE, (full, quotedKey, bareKey, raw) => {
    const key = quotedKey || bareKey;
    if (SIDEBAR_ENGLISH[key] !== unescapeJs(raw)) return full;
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    const prop = quotedKey ? `"${quotedKey}"` : bareKey;
    return `${prop}:"${translated}"`;
  });

  if (text.includes(MODE_FROM)) {
    let partCount = 0;
    const modeTo = MODE_PARTS.map(([key, english]) => {
      const translated = translateLiteral(english, dict, hits);
      if (translated === null) return `${key}:"${english}"`;
      partCount++;
      return `${key}:"${translated}"`;
    }).join(',');
    const modeHits = text.split(MODE_FROM).length - 1;
    if (modeHits && partCount) {
      count += modeHits * partCount;
      text = text.split(MODE_FROM).join(modeTo);
    }
  }

  let bareCount = 0;
  for (const english of BARE_LABELS) {
    if (!Object.prototype.hasOwnProperty.call(dict, english)) continue;
    const translated = escapeJs(dict[english]);
    if (translated === english) continue;
    const forms = new Set([`"${english}"`]);
    if (/[^\x00-\x7f]/.test(english)) {
      const hex = english.replace(/[^\x00-\x7f]/g, (ch) => {
        const code = ch.charCodeAt(0).toString(16).padStart(4, '0');
        return `\\u${code}`;
      });
      forms.add(`"${hex}"`);
      forms.add(`"${hex.toUpperCase()}"`);
    }
    for (const from of forms) {
      if (!text.includes(from)) continue;
      const n = text.split(from).length - 1;
      bareCount += n;
      hits.set(english, (hits.get(english) || 0) + n);
      text = text.split(from).join(`"${translated}"`);
    }
  }
  count += bareCount;

  return { text, count, hits };
}

function checksumBase64(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
}

/** Cursor compares these hashes to the files on disk and otherwise says the install is damaged. */
function syncChecksums(appRoot) {
  const productFile = path.join(appRoot, 'product.json');
  let text = fs.readFileSync(productFile, 'utf8');
  let changed = 0;
  for (const rel of BUNDLES) {
    const key = rel.replace(/^out\//, '');
    const file = bundlePath(appRoot, rel);
    if (!fs.existsSync(file)) continue;
    const re = new RegExp(`("${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*")([^"]*)(")`);
    if (!re.test(text)) continue;
    const hash = checksumBase64(fs.readFileSync(file));
    text = text.replace(re, (full, open, current, close) => {
      if (current === hash) return full;
      changed++;
      return `${open}${hash}${close}`;
    });
  }
  if (changed) fs.writeFileSync(productFile, text);
  return changed;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hardcodedFile(localeId) {
  return p('src', 'i18n', localeId, 'hardcoded.json');
}

function loadDict(localeId) {
  const file = hardcodedFile(localeId);
  if (!fs.existsSync(file)) {
    const ready = config.locales
      .filter((l) => l.enabled !== false && fs.existsSync(hardcodedFile(l.id)))
      .map((l) => l.id);
    fail(`${localeId} 没有硬编译文（${path.relative(p('.'), file)}）。可用：${ready.join(', ') || '无'}。`);
  }
  const data = readJson(file);
  const dict = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('$')) continue;
    if (typeof value !== 'string' || value.length === 0) {
      fail(`${path.relative(p('.'), file)} 里 “${key}” 的译文是空的。`);
    }
    if (value !== key) dict[key] = value;
  }
  if (!Object.keys(dict).length) fail(`${path.relative(p('.'), file)} 里没有译文。`);
  return dict;
}

function bundlePath(appRoot, rel) {
  return path.join(appRoot, ...rel.split('/'));
}

function stateDir(dataFolderName) {
  return path.join(os.homedir(), dataFolderName || '.cursor', 'cursor-language-pack');
}

function recordPath(dataFolderName) {
  return path.join(stateDir(dataFolderName), 'rewrite.json');
}

function backupPath(dataFolderName, commit, rel, hash) {
  const name = `${rel.split('/').join('__')}__${hash.slice(0, 12)}`;
  return path.join(stateDir(dataFolderName), 'backup', commit || 'unknown', name);
}

function cursorCli(installRoot) {
  const names = process.platform === 'win32' ? ['Cursor.exe', 'cursor.exe'] : ['Cursor', 'cursor'];
  const candidates = [
    ...names.map((name) => path.join(installRoot, name)),
    ...names.map((name) => path.join(installRoot, 'bin', name)),
    path.join(installRoot, 'MacOS', 'Cursor')
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function resolveInstall() {
  if (flags.dir) {
    const installRoot = path.resolve(String(flags.dir));
    const appRoot = path.join(installRoot, 'resources', 'app');
    if (!fs.existsSync(path.join(appRoot, 'package.json'))) {
      fail(`--dir=${flags.dir} 不是 Cursor 安装目录。\n  这一层要能看到 resources/app。macOS 填 Cursor.app/Contents。`);
    }
    return { installRoot, appRoot };
  }
  const found = findCursorInstalls();
  if (found.length === 1) return found[0];
  if (!found.length) {
    fail(
      '没有找到 Cursor。\n' +
      '  npm run translate -- --dir="安装目录"\n' +
      '  安装目录是包含 resources/app 的那一层。macOS 是 Cursor.app/Contents。'
    );
  }
  log.err('找到多个 Cursor，需要指定一个：');
  for (const item of found) {
    const info = readCursorInfo(item.appRoot);
    log.plain(`  npm run translate -- --dir="${item.installRoot}"    （${info.cursorVersion ?? '未知版本'}）`);
  }
  process.exit(1);
}

function localeChoice() {
  if (typeof flags.locale === 'string') {
    const named = config.locales.find((l) => l.id === flags.locale);
    if (!named) fail(`不认识的语言 “${flags.locale}”。`);
    return named;
  }
  return config.locales.find((l) => l.id === 'zh-cn')
    ?? config.locales.find((l) => l.enabled !== false);
}

function loadLocaleWriter() {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return {
        l10n: { t: (message) => message },
        env: {},
        window: {},
        commands: {},
        workspace: {},
        extensions: { all: [] }
      };
    }
    return original.call(this, request, parent, isMain);
  };
  try {
    const require = createRequire(import.meta.url);
    return require(p('src', 'extension', 'main.cjs')).__test;
  } finally {
    Module._load = original;
  }
}

function runCli(cli, args) {
  const result = spawnSync(cli, args, { stdio: 'inherit' });
  return !result.error && result.status === 0;
}

function findVsix() {
  const dist = p('dist');
  if (!fs.existsSync(dist)) return null;
  const files = fs.readdirSync(dist).filter((name) => name.endsWith('.vsix') && name.startsWith(`${config.namePrefix}-`));
  const exact = files.find((name) => name.includes(`-${config.version}`));
  const picked = exact ?? files[0];
  return picked ? path.join(dist, picked) : null;
}

function packInstalled(dir) {
  if (!fs.existsSync(dir)) return false;
  const prefix = `${config.publisher}.${config.namePrefix}`.toLowerCase();
  for (const name of fs.readdirSync(dir)) {
    const manifest = readJson(path.join(dir, name, 'package.json'), null);
    if (!manifest) continue;
    const id = `${manifest.publisher ?? ''}.${manifest.name ?? ''}`.toLowerCase();
    if (id === prefix) return true;
  }
  return false;
}

function conflictingPacks(dir, localeId) {
  if (!fs.existsSync(dir)) return [];
  const ours = `${config.publisher}.`.toLowerCase();
  const found = [];
  for (const name of fs.readdirSync(dir)) {
    const manifest = readJson(path.join(dir, name, 'package.json'), null);
    const localizations = manifest?.contributes?.localizations;
    if (!Array.isArray(localizations)) continue;
    const id = `${manifest.publisher ?? ''}.${manifest.name ?? ''}`;
    if (id.toLowerCase().startsWith(ours)) continue;
    const claims = localizations.some((item) =>
      item.languageId === localeId && (item.translations ?? []).some((tr) => tr.id === 'vscode'));
    if (claims) found.push(id);
  }
  return found;
}

function selfTest() {
  const sample = [
    'keep({label:"Sign In",title:"General",id:"Sign In",children:"Open",note:"Sign In please"})',
    'skip("Sign In")',
    'quoted({description:"Say \\"hi\\""})',
    'logic(new Set(["Archived"]))',
    'keys({searchKeywords:["Terminal","Bash"]})',
    'nav({"plan-usage":"Plan & Usage",general:"General",tab:"Tab",mcp:"MCP",id:"General",original:"VS Code Settings"})',
    'modes({agent:"Agent",chat:"Chat",background:"Cloud",plan:"Plan",spec:"Spec",debug:"Debug",triage:"Triage"})',
    'fn(()=>"Rules, Skills, Subagents")'
  ].join('\n');
  const { text, count } = rewrite(sample, {
    'Sign In': '登录',
    General: '通用',
    Open: '打开',
    'Say "hi"': '说「你好」',
    Archived: '已归档',
    Terminal: '终端',
    'Plan & Usage': '计划与用量',
    'VS Code Settings': 'VS Code 设置',
    'Rules, Skills, Subagents': '规则、技能、子智能体',
    Tab: '代码补全',
    Agent: '智能体',
    Chat: '对话',
    Cloud: '云端',
    Plan: '计划',
    Spec: '规格',
    Debug: '调试',
    Triage: '分诊'
  });
  const expect = [
    text.includes('label:"登录"'),
    text.includes('title:"通用"'),
    text.includes('id:"Sign In"'),
    text.includes('note:"Sign In please"'),
    text.includes('children:"打开"'),
    text.includes('skip("Sign In")'),
    text.includes('description:"说「你好」"'),
    text.includes('new Set(["Archived"])'),
    text.includes('searchKeywords:["Terminal","Bash"]'),
    text.includes('"plan-usage":"计划与用量"'),
    text.includes('general:"通用"'),
    text.includes('id:"General"'),
    text.includes('original:"VS Code Settings"'),
    text.includes('()=>"规则、技能、子智能体"'),
    text.includes('tab:"代码补全"'),
    text.includes('mcp:"MCP"'),
    text.includes('agent:"智能体"'),
    text.includes('background:"云端"'),
    text.includes('triage:"分诊"'),
    count === 15
  ];
  if (expect.some((ok) => !ok)) {
    fail(`self-test failed\n${text}`);
  }
  log.ok('self-test ok');
  process.exit(0);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun && flags['self-test']) selfTest();

if (isDirectRun) {

const install = resolveInstall();
const info = readCursorInfo(install.appRoot);
const recPath = recordPath(info.dataFolderName);
const record = readJson(recPath, null);
const sameInstall = record
  && record.installRoot === install.installRoot
  && record.commit === info.commit;

if (flags.undo) {
  if (!record || record.installRoot !== install.installRoot) {
    fail(`这个安装没有可还原的备份。\n  ${install.installRoot}`);
  }
  let restored = 0;
  const left = {};
  for (const [rel, entry] of Object.entries(record.files ?? {})) {
    const target = bundlePath(install.appRoot, rel);
    const backup = entry.backup;
    if (!backup || !fs.existsSync(backup)) {
      log.warn(`${rel} 的备份不在了，跳过。`);
      continue;
    }
    const current = fs.existsSync(target) ? sha256(fs.readFileSync(target)) : null;
    if (current && current !== entry.patched) {
      log.warn(`${rel} 已经不是这次改过的内容，没有还原。`);
      left[rel] = entry;
      continue;
    }
    fs.copyFileSync(backup, target);
    fs.rmSync(backup, { force: true });
    restored++;
  }
  const checksums = syncChecksums(install.appRoot);
  if (Object.keys(left).length) writeJson(recPath, { ...record, files: left });
  else fs.rmSync(recPath, { force: true });
  log.ok(`已还原 ${restored} 个文件。重新打开 Cursor。语言包和显示语言没有动。`);
  if (checksums) log.plain('安装校验已按当前文件重新算过。');
  process.exit(0);
}

const locale = localeChoice();
const dict = loadDict(locale.id);
const preview = flags.preview === true;
const plan = [];
let total = 0;
const seen = new Set();

log.plain(`Cursor ${info.cursorVersion ?? '?'}    ${install.installRoot}`);
log.plain(`${locale.localizedLanguageName}（${locale.id}）${preview ? '    预览，不会写入' : ''}`);

for (const rel of BUNDLES) {
  const file = bundlePath(install.appRoot, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file);
  const current = sha256(before);
  const previous = sameInstall ? record.files?.[rel] : null;
  const source = previous?.backup && fs.existsSync(previous.backup)
    ? fs.readFileSync(previous.backup)
    : before;
  const { text, count, hits } = rewrite(source.toString('utf8'), dict);
  for (const key of hits.keys()) seen.add(key);
  if (!count || text === before.toString('utf8')) continue;
  total += count;
  plan.push({ rel, file, before, text, count, original: current, previous });
  log.plain(`  ${rel}    ${count} 处`);
}

const missed = Object.keys(dict).filter((key) => !seen.has(key));
log.plain(`共 ${total} 处。译文表 ${Object.keys(dict).length} 条，这份安装里对上 ${seen.size} 条。`);

if (preview) {
  if (missed.length) {
    log.plain(`有 ${missed.length} 条在这份 Cursor 里没出现，例如：`);
    for (const key of missed.slice(0, 8)) log.plain(`  ${JSON.stringify(key)}`);
  }
  log.plain('确认后执行：npm run translate' + (locale.id === 'zh-cn' ? '' : ` -- --locale=${locale.id}`));
  process.exit(0);
}

if (!plan.length && total === 0) {
  const checksums = syncChecksums(install.appRoot);
  if (checksums) {
    log.ok(`安装校验已更新（${checksums} 处）。完全退出 Cursor 再打开，右下角的损坏提示会消失。`);
    process.exit(0);
  }
  const already = sameInstall && BUNDLES.some((rel) => {
    const file = bundlePath(install.appRoot, rel);
    const previous = record.files?.[rel];
    return previous && fs.existsSync(file) && sha256(fs.readFileSync(file)) === previous.patched;
  });
  if (already) {
    log.ok('已经改过。重新打开 Cursor 即可。更新 Cursor 之后再执行一次。');
    process.exit(0);
  }
  fail('没有改到任何文字。这份 Cursor 的文案和译文表对不上，先不要继续。');
}

const files = { ...(sameInstall ? record.files : {}) };
const written = [];
try {
  for (const item of plan) {
    const kept = item.previous?.backup && fs.existsSync(item.previous.backup)
      ? item.previous.backup
      : backupPath(info.dataFolderName, info.commit, item.rel, item.original);
    if (!fs.existsSync(kept)) {
      fs.mkdirSync(path.dirname(kept), { recursive: true });
      fs.writeFileSync(kept, item.before);
    }
    fs.writeFileSync(item.file, item.text, 'utf8');
    written.push({ file: item.file, backup: kept });
    const patched = sha256(fs.readFileSync(item.file));
    files[item.rel] = {
      original: item.previous?.original ?? item.original,
      patched,
      backup: kept
    };
  }
} catch (err) {
  for (const item of written) {
    if (fs.existsSync(item.backup)) fs.copyFileSync(item.backup, item.file);
  }
  fail(`写入失败，已把这次改过的文件放回去。\n  ${err.message}\n  如果 Cursor 正在运行，先完全退出再执行。`);
}

const checksums = syncChecksums(install.appRoot);
if (checksums) log.plain(`安装校验已更新（${checksums} 处）。`);

writeJson(recPath, {
  installRoot: install.installRoot,
  cursorVersion: info.cursorVersion,
  commit: info.commit,
  locale: locale.id,
  packVersion: config.version,
  rewrittenAt: new Date().toISOString(),
  files
});

log.ok(`已改写 ${plan.length} 个文件，共 ${total} 处。`);
log.plain(`备份在 ${path.dirname(Object.values(files)[0].backup)}`);

const cli = cursorCli(install.installRoot);
const extDir = extensionsDir(info.dataFolderName);
const vsix = findVsix();

if (packInstalled(extDir)) {
  log.plain('语言包已安装。');
} else if (!vsix) {
  log.warn('还没有语言包。扩展里搜索「汉化」安装，或在本仓库执行 npm run package 后再跑一次。');
} else if (!cli) {
  log.warn(`没有找到 Cursor 程序，语言包请手动安装：${vsix}`);
} else if (runCli(cli, ['--install-extension', vsix, '--force'])) {
  log.ok('已安装语言包。');
} else {
  log.warn('语言包没装上。可在扩展里搜索「汉化」，或退出 Cursor 后重试。');
}

for (const id of conflictingPacks(extDir, locale.id)) {
  if (!cli) {
    log.warn(`请卸载另一个语言包：${id}`);
    continue;
  }
  if (runCli(cli, ['--uninstall-extension', id])) log.ok(`已卸载 ${id}`);
  else log.warn(`没能卸载 ${id}。两个语言包同时在，重启后翻译会乱。`);
}

const argvFile = argvJsonPath(info.dataFolderName);
try {
  const { readLocale, writeLocale } = loadLocaleWriter();
  if (readLocale(argvFile) === locale.id) {
    log.plain(`显示语言已经是 ${locale.id}。`);
  } else {
    writeLocale(argvFile, locale.id);
    log.ok(`显示语言已设为 ${locale.id}。`);
  }
} catch (err) {
  log.warn(`没能写入显示语言（${argvFile}）：${err.message}`);
  log.plain('打开 Cursor 后，命令面板执行 Language Pack: Select Display Language。');
}

log.plain('完全退出 Cursor 再打开。更新 Cursor 后重新执行 npm run translate。');
log.plain('还原程序文件：npm run translate -- --undo');
}
