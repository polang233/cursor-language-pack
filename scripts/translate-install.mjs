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

const COMMERCE_BUNDLE = 'out/vs/workbench/workbench.xai-commerce-prepaid.js';
const BUNDLES = [
  'out/vs/workbench/workbench.desktop.main.js',
  'out/vs/workbench/workbench.glass.main.js',
  'out/vs/workbench/workbench.anysphere-ui-automations.js',
  COMMERCE_BUNDLE
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
  'Show Cursor in menu bar',
  'Get Cursor for iOS',
  'Get Grok Bot',
  'Contact Us',
  'Log Out',
  'Share Data',
  'Improve Cursor for everyone',
  'No training. Code may be stored for Background Agent and other features.',
  'Choose the default behavior of messages sent while Agent is working',
  'Custom words that submit a voice prompt. Spaces and punctuation are ignored.',
  'Third-Party Imports',
  'Choose how Agents run tools like command execution, MCP, and file writes.',
  "A classifier will run for each action and decide whether it's safe to execute this command. Allowlists are still respected.",
  'File-Deletion Protection',
  'External-File Protection',
  'Allowlist Options',
  'You can configure Shell, MCP and Fetch allowlists for Auto mode. However, Auto works well without these.',
  'You can configure Shell, MCP, Fetch, and Read allowlists for Auto mode. However, Auto works well without these.',
  'Choose Origin (cursor.com/codebase) or GitHub for GitHub pull request links on web and desktop',
  'Choose Origin (cursor.com/codebase), GitHub, or Graphite for pull request links on web and desktop',
  'Inside Cursor',
  'Index Repositories for Instant Grep',
  'Automatically index repositories to speed up Grep searches. All data is stored locally.',
  'Start from scratch',
  'Use Existing...',
  'This PC',
  'This Mac',
  'This Computer',
  'Submit with Ctrl + Enter',
  'Learn more',
  'When enabled, your cursor.com profile page is visible to anyone with the link.',
  'Public profiles are disabled by your team admin.',
  'Current Plan',
  'Upgrade Available',
  'Adjust Plan',
  'Unlock 3x more usage on Agent & more',
  'Cursor Models',
  'Includes Cursor Grok and Composer',
  'Other Models',
  'Additional usage beyond limits consumes Other Models quota or on-demand spend.',
  'Additional usage beyond limits consumes on-demand spend.',
  'Search Settings',
  'Remote Control',
  'Allow agents on this computer to be controlled remotely from mobile',
  'Auto-Review',
  'Auto-Review (with Sandbox)',
  'Auto-review',
  'Auto-review (with Sandbox)',
  'Allowlist',
  'Run Everything',
  'Run Everything (Unsandboxed)',
  'Auto-Accept Web Search',
  'Skip approval dialog; Agent may run web searches automatically',
  'Wait indefinitely to authenticate when prompted. When off, skip authentication prompts after 30 seconds.',
  'Browser Automation',
  'Browser Protection',
  'Connected to Browser Tab',
  'Browser Tab',
  'Browser automation disabled',
  'Prevent Agent from automatically running Browser tools',
  'Open Local Links in Cursor Browser',
  'Open Web Links in Cursor Browser',
  'Automatically open localhost links in the Browser Tab',
  'Automatically open http and https links in the Browser Tab',
  'By default, get notifications for stable updates. In Early Access, pre-release builds may be unstable for production work.',
  'Plan, Build, / for skills, @ for context',
  'Plan New Idea',
  'Multitask',
  'Run in Cloud',
  'Run locally in a Worktree',
  'Start with a plan',
  'Align on implementation before writing code',
  'Debug an issue',
  'Find root causes and fix tricky bugs',
  'New Automation',
  'No Automations Yet',
  'Ship better code, faster',
  'Review Code with Bugbot',
  'Catch bugs and auto-fix before they ship.',
  'Scan and Triage Security Vulnerabilities',
  'Security checks on every change.',
  'Route PR Reviews and Auto-Approve',
  'Assign reviewers and approve PRs.',
  'Get Started',
  'All Runs',
  'Mine',
  'Team',
  'Search...',
  'New Project',
  'Projects',
  'Automate repetitive tasks with always-on agents and configure Cursor\'s built-in agents for your team.',
  'Show status filters',
  'Show PR filters',
  'Show environment filters',
  'Sidebar filters',
  'Hide Sidebar',
  'Show Sidebar'
];

/** Fragments inside template literals. The translation is the dictionary value. */
const PHRASES = [
  'Prevent Agent from creating or modifying files outside of the workspace automatically',
  'Prevent Agent from deleting files automatically',
  'Use with caution. Skip symlinks during .cursorignore file discovery. Enable only when all .cursorignore files are reachable without symlinks.',
  'Apply .cursorignore files to all subdirectories',
  'Changing this setting requires restarting Cursor.',
  ' (controlled by admin)',
  'Accept the next word of a suggestion via ',
  'Automatically import necessary modules for ',
  'Automatically parse links when pasted into Quick Edit (',
  "Mark Agent commits as 'Made with Cursor'",
  'Mark pull requests as made with Cursor',
  'Automatically index repositories to speed up Grep searches. All data is stored locally.',
  'Usage limits reset on ',
  '${s} hour${s===1?"":"s"} and ${o} minute${o===1?"":"s"} left',
  '${s} hour${s===1?"":"s"} left',
  '${o} minute${o===1?"":"s"} left',
  '${a} day${a===1?"":"s"} left',
  '${dh1(t)}% used',
  'Included in ',
  'Enter submits chat, Enter inserts a newline, and primary actions move to ',
  'Submit with ',
  'return"Customize"',
  'name:"Customize"',
  'value:"New Chat"',
  '||"New Chat"',
  '??"New Chat"',
  'LABEL="New Chat"',
  'pageTitle:"Automations"',
  'e7a="New Chat"',
  'MUd="New Chat"',
  '{value:"source",label:"Source",icon:"arrow-bracket-to-right"}'
];

/**
 * Agents sidebar “Source” means 来源. The same word on a file tab means the
 * raw view, so it cannot be a plain `label:"Source"` replacement.
 * The minified binding between these two fields changes between builds.
 */
const SOURCE_FILTER_KEY = 'contentLabel:"Show source filters",label:"Source"';
const SOURCE_FILTER_RE = /contentLabel:"Show source filters",deviates:([A-Za-z_$][\w$]*),label:"Source"/g;

const NAV_RE = /(?:"([A-Za-z0-9-]+)"|([A-Za-z_$][\w$]*)):"((?:\\.|[^"\\])*)"/g;

/**
 * Replace a translation only when the English text is the entire value of a
 * UI field (`label:"…"`, `title:"…"`, …) or a Cursor Settings sidebar name.
 * A word inside a longer string, a search keyword, or an id is left alone.
 */
const EXTRA_DISPLAY_COPY = [
  "Sign-in on this device is restricted by your organization's device policy. Sign in with an allowed account to continue.",
  "Slack isn't available for this Project",
  'Your browser is signed in to another Cursor account. Switch to this one, then connect again.',
  "Slack didn't finish connecting. Connect again to pick up where you left off.",
  'Finish in Slack, then connect again. If Slack asked for approval, an admin must approve Cursor first.',
  'Approve Cursor in Slack. This updates on its own.',
  'Ask a Slack admin to approve Cursor, then connect again'
];

export function rewrite(source, dict) {
  FIELD_RE.lastIndex = 0;
  const hits = new Map();
  let count = 0;
  const replaceDisplayLiterals = (block) => block.replace(/"((?:\\.|[^"\\])*)"/g, (full, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `"${translated}"`;
  });
  let text = source;
  // Edit-session descriptors contain additional display fields beside placeholder.
  // Match the complete descriptor, leaving queue-item/goal dispatch IDs intact.
  text = text.replace(/\b(?:queueItem|goal):\(\)=>\(\{bannerLabel:"(?:\\.|[^"\\])*",placeholder:"(?:\\.|[^"\\])*",cancelLabel:"(?:\\.|[^"\\])*",pillLabel:"(?:\\.|[^"\\])*",pillTitle:"(?:\\.|[^"\\])*"\}\)/g,
    replaceDisplayLiterals);
  text = text.replace(/\brecordScreenToolCall:\{loading:"Recording screen",completed:"Recorded screen",error:"Record screen"\}/g,
    replaceDisplayLiterals);
  // These contiguous constants belong to the computer permission component.
  // The permission IDs and ordinary Allow/Ready strings elsewhere are untouched.
  text = text.replace(/[A-Za-z_$][\w$]*="Enable Computer Use",[A-Za-z_$][\w$]*="Allow Cursor to use your computer\.",[A-Za-z_$][\w$]*="Cursor Computer Use is not available in this build",[A-Za-z_$][\w$]*="Back to Cursor",[A-Za-z_$][\w$]*="Computer Use is ready",[A-Za-z_$][\w$]*="Allow",[A-Za-z_$][\w$]*="Allowing(?:\\u2026|…)",[A-Za-z_$][\w$]*="Ready"(?=,[A-Za-z_$][\w$]*=\[\{kind:"accessibility")/g,
    replaceDisplayLiterals);
  text = text.replace(FIELD_RE, (full, field, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `${field}:"${translated}"`;
  });

  // The credits card's parent title is a variable, rather than a literal UI
  // field. Require both its paired commerce locale and the nearby component
  // context so unrelated "Credits" strings and the English locale stay intact.
  text = text.replace(/(?<![\w$])(?:(var|let|const)\s+)?([A-Za-z_$][\w$]*)="Credits",([A-Za-z_$][\w$]*)="en"(?=[;},])/g,
    (full, declaration, title, locale, offset) => {
      const context = text.slice(Math.max(0, offset - 5000), offset + full.length + 5000);
      if (!context.includes('import("./workbench.xai-commerce-prepaid.js")') ||
          !context.includes('"plan-usage-credits-card"') ||
          !new RegExp(`\\btitle\\s*:\\s*${title.replace(/[$]/g, '\\$&')}(?![\\w$])`).test(context) ||
          !new RegExp(`\\blocale\\s*:\\s*${locale.replace(/[$]/g, '\\$&')}(?![\\w$])`).test(context)) return full;
      const translated = translateLiteral('Credits', dict, hits);
      if (translated === null) return full;
      count++;
      return `${declaration ? declaration + ' ' : ''}${title}="${translated}",${locale}="en"`;
    });

  // These full sentences are notification/view-model copy rather than IDs.
  for (const english of EXTRA_DISPLAY_COPY) {
    const from = `"${escapeJs(english)}"`;
    if (!text.includes(from)) continue;
    const translated = translateLiteral(english, dict, hits);
    if (translated === null) continue;
    const occurrences = text.split(from).length - 1;
    count += occurrences;
    hits.set(english, (hits.get(english) || 0) + occurrences - 1);
    text = text.split(from).join(`"${translated}"`);
  }

  text = text.replace(/"aria-label"\s*:\s*"((?:\\.|[^"\\])*)"/g, (full, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `"aria-label":"${translated}"`;
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

  for (const english of PHRASES) {
    if (!Object.prototype.hasOwnProperty.call(dict, english)) continue;
    const translated = dict[english];
    if (typeof translated !== 'string' || translated === english || !text.includes(english)) continue;
    const n = text.split(english).length - 1;
    count += n;
    hits.set(english, (hits.get(english) || 0) + n);
    text = text.split(english).join(translated);
  }

  const sourceFilter = dict[SOURCE_FILTER_KEY];
  if (typeof sourceFilter === 'string' && sourceFilter !== SOURCE_FILTER_KEY && sourceFilter.includes('",label:"')) {
    SOURCE_FILTER_RE.lastIndex = 0;
    text = text.replace(SOURCE_FILTER_RE, (full, binding) => {
      count++;
      hits.set(SOURCE_FILTER_KEY, (hits.get(SOURCE_FILTER_KEY) || 0) + 1);
      return sourceFilter.replace('",label:"', `",deviates:${binding},label:"`);
    });
  }

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

function loadCommerceDict(localeId) {
  const file = p('src', 'i18n', localeId, 'commerce.json');
  const dict = {};
  for (const [key, value] of Object.entries(readJson(file, {}))) {
    if (key.startsWith('$')) continue;
    if (typeof value !== 'string' || !value) fail(`${file} 的 “${key}” 缺少译文。`);
    if (key !== value) dict[key] = value;
  }
  return dict;
}

function bundlePath(appRoot, rel) {
  return path.join(appRoot, ...rel.split('/'));
}

function stateDir(dataFolderName) {
  return path.join(os.homedir(), dataFolderName || '.cursor', 'cursor-language-pack');
}

function normalizedInstall(installRoot) {
  const resolved = path.resolve(installRoot);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function installStateDir(info, installRoot) {
  const normalized = normalizedInstall(installRoot);
  const installId = sha256(Buffer.from(normalized)).slice(0, 16);
  const buildId = sha256(Buffer.from(`${info.commit ?? ''}:${info.cursorVersion ?? ''}`)).slice(0, 16);
  return path.join(stateDir(info.dataFolderName), 'installs', installId, buildId);
}

function backupPath(info, installRoot, rel, hash) {
  const name = `${rel.split('/').join('__')}__${hash.slice(0, 12)}`;
  return path.join(installStateDir(info, installRoot), 'backup', name);
}

function saveRecord(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

function cursorCli(installRoot) {
  const names = process.platform === 'win32' ? ['Cursor.exe', 'cursor.exe'] : ['Cursor', 'cursor'];
  const candidates = [
    ...names.map((name) => path.join(installRoot, name)),
    ...names.map((name) => path.join(installRoot, 'bin', name)),
    path.join(installRoot, 'bin', 'cursor'),
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

function runCli(cli, args, appRoot) {
  const cliScript = path.join(appRoot, 'out', 'cli.js');
  const electron = fs.existsSync(cliScript) && !cli.endsWith(`${path.sep}bin${path.sep}cursor`);
  const result = spawnSync(cli, electron ? [cliScript, ...args] : args, {
    stdio: 'inherit', windowsHide: true,
    env: electron ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env
  });
  return !result.error && result.status === 0;
}

function findVsix() {
  if (typeof flags.vsix === 'string') {
    const file = path.resolve(flags.vsix);
    if (!fs.existsSync(file)) fail(`语言扩展不存在：${file}`);
    return file;
  }
  const dist = p('dist');
  if (!fs.existsSync(dist)) return null;
  const files = fs.readdirSync(dist).filter((name) => name.endsWith('.vsix') && name.startsWith(`${config.namePrefix}-`));
  const picked = files.find((name) => name === `${config.namePrefix}-${config.version}.vsix`);
  return picked ? path.join(dist, picked) : null;
}

// An extensions folder also holds plain files (`extensions.json`, `.obsolete`). Reading
// `<file>/package.json` throws ENOTDIR, which aborted an otherwise finished install with
// "汉化未完成" even though the patch and the extension were already in place.
function installedManifests(dir) {
  if (!fs.existsSync(dir)) return [];
  const manifests = [];
  for (const name of fs.readdirSync(dir)) {
    const extDir = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(extDir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const manifest = readJson(path.join(extDir, 'package.json'), null);
    if (manifest) manifests.push(manifest);
  }
  return manifests;
}

export function packInstalled(dir) {
  const prefix = `${config.publisher}.${config.namePrefix}`.toLowerCase();
  return installedManifests(dir).some(
    (manifest) => `${manifest.publisher ?? ''}.${manifest.name ?? ''}`.toLowerCase() === prefix
  );
}

export function conflictingPacks(dir, localeId) {
  const ours = `${config.publisher}.`.toLowerCase();
  const found = [];
  for (const manifest of installedManifests(dir)) {
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
    'keep({label:"Sign In",title:"General",id:"Sign In",children:"Open","aria-label":"Sign In",note:"Sign In please"})',
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
    text.includes('"aria-label":"登录"'),
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
    count === 16
  ];
  const sourceSample = [
    '{value:"raw",label:"Source",ariaLabel:"Source"}',
    '{value:"source",label:"Source",icon:"arrow-bracket-to-right"}',
    'van({contentLabel:"Show source filters",deviates:mn,label:"Source"})'
  ].join('\n');
  const source = rewrite(sourceSample, {
    '{value:"source",label:"Source",icon:"arrow-bracket-to-right"}': '{value:"source",label:"来源",icon:"arrow-bracket-to-right"}',
    'contentLabel:"Show source filters",label:"Source"': 'contentLabel:"显示来源筛选",label:"来源"'
  });
  expect.push(
    source.text.includes('{value:"raw",label:"Source",ariaLabel:"Source"}'),
    source.text.includes('{value:"source",label:"来源",icon:"arrow-bracket-to-right"}'),
    source.text.includes('contentLabel:"显示来源筛选",deviates:mn,label:"来源"'),
    source.count === 2
  );
  if (expect.some((ok) => !ok)) {
    fail(`self-test failed\n${text}\n${source.text}`);
  }
  log.ok('self-test ok');
  process.exit(0);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun && flags['self-test']) selfTest();

if (isDirectRun) {
try {
const install = resolveInstall();
const info = readCursorInfo(install.appRoot);
const recPath = path.join(installStateDir(info, install.installRoot), 'rewrite.json');
const legacy = readJson(path.join(stateDir(info.dataFolderName), 'rewrite.json'), null);
const matches = (entry) => entry && normalizedInstall(entry.installRoot) === normalizedInstall(install.installRoot)
  && entry.commit === info.commit && entry.cursorVersion === info.cursorVersion;
const record = readJson(recPath, null) ?? (matches(legacy) ? legacy : null);
const sameInstall = matches(record);

if (flags.status) {
  log.plain('Cursor ' + info.cursorVersion + '    ' + install.installRoot);
  if (!sameInstall) log.plain('尚未汉化当前版本。');
  else {
    let intact = 0;
    for (const [rel, entry] of Object.entries(record.files ?? {})) {
      const file = bundlePath(install.appRoot, rel);
      if (fs.existsSync(file) && sha256(fs.readFileSync(file)) === entry.patched) intact++;
    }
    log.plain('语言 ' + record.locale + '，语言包 ' + record.packVersion + '，补丁完整 ' + intact + '/' + Object.keys(record.files ?? {}).length + '。');
  }
  process.exit(0);
}

if (flags.undo) {
  if (!sameInstall) { log.ok('当前版本没有需要恢复的补丁。'); process.exit(0); }
  let restored = 0;
  const left = {};
  for (const [rel, entry] of Object.entries(record.files ?? {})) {
    const target = bundlePath(install.appRoot, rel);
    const backup = entry.backup;
    if (!backup || !fs.existsSync(backup) || sha256(fs.readFileSync(backup)) !== entry.original) {
      log.warn(rel + ' 的原始备份缺失或有改动，保留恢复记录。');
      left[rel] = entry;
      continue;
    }
    const current = fs.existsSync(target) ? sha256(fs.readFileSync(target)) : null;
    if (!current || ![entry.patched, entry.original, entry.pendingFrom].includes(current)) {
      log.warn(rel + ' 已被更新或修改，保留文件和恢复记录。');
      left[rel] = entry;
      continue;
    }
    fs.copyFileSync(backup, target);
    restored++;
  }
  syncChecksums(install.appRoot);
  if (Object.keys(left).length) saveRecord(recPath, { ...record, files: left });
  else {
    fs.rmSync(recPath, { force: true });
    // An imported legacy record must not be rediscovered after a successful restore.
    if (matches(legacy)) fs.rmSync(path.join(stateDir(info.dataFolderName), 'rewrite.json'), { force: true });
  }
  log.ok('已还原 ' + restored + ' 个文件。语言包和显示语言可在 Cursor 内调整。');
  process.exit(Object.keys(left).length ? 1 : 0);
}

const locale = localeChoice();
const dict = loadDict(locale.id);
const commerceDict = loadCommerceDict(locale.id);
const preview = flags.preview === true;
const plan = [];
const seen = new Set();
let total = 0;
let already = false;

log.plain('Cursor ' + info.cursorVersion + '    ' + install.installRoot);
log.plain(locale.localizedLanguageName + '（' + locale.id + '）' + (preview ? '    预览' : ''));

for (const rel of BUNDLES) {
  const file = bundlePath(install.appRoot, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file);
  const current = sha256(before);
  const previous = sameInstall ? record.files?.[rel] : null;
  let source = before;
  if (previous) {
    if (![previous.original, previous.patched, previous.pendingFrom].includes(current)) {
      fail(rel + ' 在汉化后又被修改，请先恢复该文件或重新安装 Cursor。备份已保留。');
    }
    if (!previous.backup || !fs.existsSync(previous.backup)) fail(rel + ' 的备份缺失，无法重新汉化。');
    source = fs.readFileSync(previous.backup);
    if (sha256(source) !== previous.original) fail(rel + ' 的备份校验失败，已停止。');
    if (current === previous.patched) already = true;
  }
  const { text, count, hits } = rel === COMMERCE_BUNDLE
    ? (await import('./lib/commerce-i18n.mjs')).rewriteCommerce(source.toString('utf8'), commerceDict)
    : rewrite(source.toString('utf8'), dict);
  for (const key of hits.keys()) seen.add(key);
  if (text === before.toString('utf8') || (!count && !previous)) continue;
  total += count;
  plan.push({ rel, file, before, text, count, original: sha256(source), previous, current });
  log.plain('  ' + rel + '    ' + count + ' 处');
}

log.plain('共 ' + total + ' 处，译文表在当前安装中匹配 ' + seen.size + ' 条。');
if (preview) { log.plain('预览完成，执行 install 应用。'); process.exit(0); }
if (!plan.length && !already) fail('没有匹配的文案。当前 Cursor 版本可能尚未适配。');

const files = { ...(sameInstall ? record.files : {}) };
for (const item of plan) {
  const backup = item.previous?.backup ?? backupPath(info, install.installRoot, item.rel, item.original);
  if (!fs.existsSync(backup)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, item.before, { flag: 'wx' });
  }
  files[item.rel] = { original: item.original, patched: sha256(Buffer.from(item.text)), backup, pendingFrom: item.current };
}
const nextRecord = {
  installRoot: install.installRoot, cursorVersion: info.cursorVersion, commit: info.commit,
  locale: locale.id, packVersion: config.version, rewrittenAt: new Date().toISOString(), files
};
// Journal before touching the install so an interrupted run remains recoverable.
saveRecord(recPath, nextRecord);
for (const item of plan) {
  const temp = item.file + '.language-pack-' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temp, item.text, { encoding: 'utf8', mode: fs.statSync(item.file).mode & 0o777, flag: 'wx' });
    if (sha256(fs.readFileSync(item.file)) !== item.current) throw new Error(item.rel + ' 在准备期间又被修改，已停止。');
    fs.renameSync(temp, item.file);
  } finally { fs.rmSync(temp, { force: true }); }
}
const checksums = syncChecksums(install.appRoot);
if (checksums) log.plain('安装校验已更新。');
for (const entry of Object.values(files)) delete entry.pendingFrom;
saveRecord(recPath, nextRecord);
log.ok(plan.length ? '已汉化 ' + plan.length + ' 个文件。' : '程序文件已是所选语言。');

const cli = cursorCli(install.installRoot);
const extDir = extensionsDir(info.dataFolderName);
const vsix = findVsix();
const off = (name) => flags['no-' + name] === true || flags[name] === false;
let completed = true;
let extensionReady = false;
if (off('extension')) log.plain('已跳过语言扩展安装。');
else if (vsix && cli) {
  extensionReady = runCli(cli, ['--install-extension', vsix, '--force'], install.appRoot);
  if (!extensionReady) { log.warn('语言扩展安装失败，请退出 Cursor 后重跑。'); completed = false; }
} else if (packInstalled(extDir) && !flags.vsix) extensionReady = true;
else { log.warn('缺少当前版本的 VSIX 或 Cursor 命令行入口，请重新运行安装工具。'); completed = false; }

if (extensionReady && !off('keep-official')) {
  for (const id of conflictingPacks(extDir, locale.id)) {
    if (!cli || !runCli(cli, ['--uninstall-extension', id], install.appRoot)) {
      log.warn('无法卸载冲突的语言包：' + id); completed = false;
    }
  }
}
if (!off('set-locale')) {
  const argvFile = argvJsonPath(info.dataFolderName);
  try {
    const { readLocale, writeLocale } = loadLocaleWriter();
    if (readLocale(argvFile) !== locale.id) writeLocale(argvFile, locale.id);
    log.ok('显示语言已设为 ' + locale.id + '。');
  } catch (err) { log.warn('无法设置显示语言：' + err.message); completed = false; }
}
log.plain('完全退出 Cursor 再打开。Cursor 更新后重新执行安装命令。');
if (!completed) log.warn('部分步骤未完成。重跑相同命令可重试，原始备份已保留。');
process.exitCode = completed ? 0 : 1;
} catch (err) {
  log.err('汉化未完成：' + err.message);
  if (err.code === 'EPERM' && process.platform === 'darwin') {
    // macOS "App Management" (TCC) denies writes into another app's bundle even when the
    // files are yours and Cursor is closed; the generic advice below sent people chasing
    // a running Cursor. Once refused, macOS stops asking, so it has to be switched on by hand.
    log.plain('macOS 的「App 管理」阻止了写入（不是文件权限，也不是 Cursor 没退出）：');
    log.plain('  系统设置 → 隐私与安全性 → App 管理，打开运行本命令的终端 App 的开关后重跑。');
    log.plain('  被拒绝过一次后系统不再弹窗，需要在上面手动打开。');
    log.plain('  备份与记录保存在用户目录。');
  } else {
    log.plain('请完全退出 Cursor 后重试；安装在系统目录时需要写入权限。备份与记录保存在用户目录。');
  }
  process.exitCode = 1;
}
}
