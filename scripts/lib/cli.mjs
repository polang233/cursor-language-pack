import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { p, readJson } from './util.mjs';
import { resolveLocale, systemLocale } from './system-locale.mjs';

const COMMANDS = ['install', 'preview', 'status', 'restore'];
const LOCALES = readJson(p('config.json')).locales.filter(l => l.enabled !== false);
const LOCALE_IDS = LOCALES.map(l => l.id);

export function parseCli(args) {
  const options = {};
  let command;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--version' || arg === '-v') { options.version = true; continue; }
    if (arg === '--yes' || arg === '-y') { options.yes = true; continue; }
    if (arg.startsWith('--')) {
      const equal = arg.indexOf('=');
      const key = arg.slice(2, equal < 0 ? undefined : equal);
      if (!['locale', 'dir', 'install-dir'].includes(key)) throw new Error(`未知参数：${arg}`);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value || value.startsWith('--')) throw new Error(`--${key} 需要一个值。`);
      const canonical = key === 'install-dir' ? 'dir' : key;
      if (options[canonical] !== undefined) throw new Error(`--${canonical} 只能指定一次。`);
      options[canonical] = value;
    } else {
      if (command || !COMMANDS.includes(arg)) throw new Error(`未知命令：${arg}`);
      command = arg;
    }
  }
  if (options.locale && !['auto', ...LOCALE_IDS].includes(options.locale)) {
    throw new Error(`语言可选 auto、${LOCALE_IDS.join('、')}。`);
  }
  return { command: command ?? 'install', options };
}

export async function runCli(product, args = process.argv.slice(2)) {
  try {
    const { command, options } = parseCli(args);
    const name = product === 'cursor' ? 'Cursor' : 'Kiro';
    const pkg = readJson(p('package.json'));
    if (options.version) { console.log(pkg.version); return; }
    if (options.help) {
      if ((options.locale && options.locale !== 'auto' ? options.locale : resolveLocale(systemLocale())) === 'ja') {
        console.log(`${name} Language Pack\n\nnpx ${pkg.name}@latest [install|preview|status|restore] [オプション]\n\n省略時はインストールします。先に ${name} を完全に終了し、完了後に起動し直してください。\n  --locale=${LOCALE_IDS.join('|')}  表示言語を指定（省略時はシステム言語）\n  --dir=<パス>           インストール先を指定。macOS は ${name}.app も指定可能\n  --yes                  複数ある場合は --dir で選択\n  --help                 ヘルプを表示\n  --version              バージョンを表示\n\n日本語のシステムでは日本語、TW/HK/MO・zh-Hant では繁体字、それ以外は簡体字を選びます。\nrestore はアプリのファイルを復元します。表示言語と拡張機能は ${name} 内で変更できます。`);
        return;
      }
      console.log(`${name} Language Pack\n\nnpx ${pkg.name}@latest [install|preview|status|restore] [选项]\n\n不带命令时安装。先完全退出 ${name}，完成后重新打开。\n  --locale=${LOCALE_IDS.join("|")}  指定语言，默认按系统语言选择\n  --dir=<路径>          指定安装目录，macOS 可填 ${name}.app\n  --yes                 多份安装时要求用 --dir 指定，跳过选择\n  --help                显示帮助\n  --version             显示版本\n\n日语系统默认日本語；台湾、香港、澳门及 zh-Hant 默认繁体，其他系统默认简体。\nrestore 恢复程序文件，显示语言和语言扩展可在 ${name} 内调整。`);
      return;
    }
    const paths = await import(`./${product}-paths.mjs`);
    let dir = options.dir;
    if (!dir) {
      const installs = product === 'cursor' ? paths.findCursorInstalls() : paths.findKiroInstalls();
      if (installs.length === 1) dir = installs[0].installRoot;
      else if (installs.length > 1) {
        const list = installs.map((item, i) => `  ${i + 1}. ${item.installRoot}`).join('\n');
        if (options.yes || !process.stdin.isTTY || !process.stdout.isTTY) {
          throw new Error(`找到多份 ${name}，请用 --dir 指定：\n${list}`);
        }
        console.log(`选择 ${name} 安装目录：\n${list}`);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        let answer;
        try { answer = await rl.question('输入编号：'); } finally { rl.close(); }
        if (!/^\d+$/.test(answer.trim())) throw new Error('已取消。');
        dir = installs[Number(answer.trim()) - 1]?.installRoot;
        if (!dir) throw new Error('已取消。');
      } else throw new Error(`找不到 ${name}。请用 --dir 指定安装目录。`);
    }
    dir = path.resolve(dir);
    if (/\.app$/i.test(dir)) dir = path.join(dir, 'Contents');
    const appRoot = path.join(dir, 'resources', 'app');
    if (!fs.existsSync(path.join(appRoot, 'package.json'))) throw new Error(`安装目录中找不到 resources/app：${dir}`);
    const flags = [`--${product === 'cursor' ? 'dir' : 'install-dir'}=${dir}`];
    if (command === 'restore') flags.push(product === 'cursor' ? '--undo' : '--restore');
    else if (command === 'status') flags.push('--status');
    else {
      const config = readJson(p('config.json'));
      const info = product === 'cursor' ? paths.readCursorInfo(appRoot) : paths.readKiroInfo(appRoot);
      const version = product === 'cursor' ? info.cursorVersion : info.kiroVersion;
      const verified = product === 'cursor' ? config.target.verifiedCursorVersions : config.target.verifiedKiroVersions;
      if (version && !verified.includes(version)) console.warn(`${name} ${version} 尚未验证，新增或变更的文案可能显示英文。`);
      const detected = options.locale && options.locale !== 'auto' ? null : systemLocale();
      const locale = detected === null ? options.locale : resolveLocale(detected);
      const label = LOCALES.find(l => l.id === locale)?.localizedLanguageName ?? locale;
      console.log(locale === 'ja'
        ? `表示言語：${label}${detected === null ? '' : `（システム：${detected}）`}。--locale で変更できます。`
        : `语言：${label}${detected === null ? '' : `（系统 ${detected}）`}。可用 --locale=${LOCALE_IDS.join('|')} 更改。`);
      flags.push(`--locale=${locale}`);
      if (command === 'install') {
        const vsix = [p('assets', 'language-pack.vsix'), p('dist', `${config.namePrefix}-${config.version}.vsix`)]
          .find((file) => fs.existsSync(file));
        if (!vsix) throw new Error('包内缺少语言扩展。源码运行前请执行 npm run package:npm。');
        flags.push(`--vsix=${vsix}`);
        if (product === 'kiro') flags.push('--apply');
      } else if (product === 'cursor') flags.push('--preview');
    }
    flags.push('--yes');
    const script = product === 'cursor' ? 'translate-install.mjs' : 'patch-install.mjs';
    const result = spawnSync(process.execPath, [p('scripts', script), ...flags], { stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (err) {
    console.error(`安装工具：${err.message}`);
    process.exitCode = 1;
  }
}
