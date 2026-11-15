import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Select a bundled translation from the OS display language. */
export function resolveLocale(language) {
  const tag = String(language ?? '').trim().split(/[.:@]/)[0].replaceAll('_', '-').toLowerCase();
  if (/^ja(?:-|$)/.test(tag)) return 'ja';
  if (tag === 'zh-cht' || tag === 'cht' || /^(tw|hk|mo)$/.test(tag)) return 'zh-tw';
  if (/(^|-)hans($|-)/.test(tag)) return 'zh-cn';
  if (/(^|-)hant($|-)/.test(tag) || /(^|-)(tw|hk|mo)($|-)/.test(tag)) return 'zh-tw';
  return 'zh-cn';
}

/** Read the display language, rather than inferring it from the time zone. */
export function systemLocale({ platform = process.platform, env = process.env, run = spawnSync,
  fallback = () => Intl.DateTimeFormat().resolvedOptions().locale } = {}) {
  const read = (command, args) => {
    try {
      const result = run(command, args, { encoding: 'utf8', timeout: 3000, windowsHide: true });
      return result.status === 0 ? result.stdout.trim() : '';
    } catch { return ''; }
  };
  if (platform === 'win32') {
    const shell = env.SystemRoot
      ? path.join(env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    const language = read(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '(Get-UICulture).Name']);
    if (language) return language;
  } else if (platform === 'darwin') {
    const languages = read('/usr/bin/defaults', ['read', '-g', 'AppleLanguages']);
    const first = languages.match(/[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*/i)?.[0];
    if (first) return first;
  }
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'LANGUAGE', 'LANG']) {
    if (env[key]) return env[key].split(':')[0];
  }
  return fallback() || 'en';
}
