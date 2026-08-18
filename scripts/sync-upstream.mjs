#!/usr/bin/env node
/**
 * Downloads the Code OSS translation baseline from microsoft/vscode-loc into
 * `upstream/<locale>/`. Only needed for `full` mode builds.
 *
 * vscode-loc is MIT licensed for both its source and its translated strings, so
 * redistribution is permitted. See NOTICE.
 *
 * Two strategies:
 *   metadata  Derive the file list from metadata/cursor.json, i.e. fetch exactly the
 *             bundles for the extensions this Cursor build actually ships. Uses only
 *             raw.githubusercontent.com, so no GitHub API rate limit applies.
 *   api       List the pack directory through the GitHub trees API. Needed when no
 *             local Cursor is available (CI). Set GITHUB_TOKEN to raise the limit.
 *
 * `auto` (default) prefers metadata and falls back to the API.
 *
 * Usage: npm run sync [-- --locale=zh-cn] [--strategy=auto|metadata|api] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { p, readJson, writeJson, log, parseArgs, loadConfig, rmrf } from './lib/util.mjs';

const CONCURRENCY = 8;
const UA = 'cursor-language-pack-build';

const { flags } = parseArgs();
const config = loadConfig();
const { repo, ref } = config.upstream;

const requestedStrategy = typeof flags.strategy === 'string' ? flags.strategy : 'auto';

const metadataFile = p('metadata', 'cursor.json');
const metadata = fs.existsSync(metadataFile) ? readJson(metadataFile) : null;

const locales = config.locales
  .filter((l) => l.enabled !== false)
  .filter((l) => (flags.locale ? l.id === flags.locale : true));

// Only Standalone-style builds embed the workbench baseline. When no enabled mode
// needs it there is nothing to download, so this becomes a no-op instead of a
// pointless 90 file fetch on every CI run.
const upstreamNeeded = Object.values(config.modes)
  .some((mode) => mode.enabled !== false && mode.includeUpstream);
if (!upstreamNeeded && !flags.force) {
  log.info('No enabled build mode embeds the workbench baseline, nothing to sync.');
  log.plain('  Enable a mode with "includeUpstream": true in config.json, or pass --force.');
  process.exit(0);
}

const rawUrl = (repoPath) =>
  `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${repoPath.split('/').map(encodeURIComponent).join('/')}`;

async function fetchText(url, { allow404 = false } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 404 && allow404) return null;
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchTree() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': UA };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const hint = res.status === 403
      ? ' - anonymous rate limit hit, set GITHUB_TOKEN or run `npm run extract` first to use the metadata strategy'
      : res.status === 404
        ? ` - check upstream.repo / upstream.ref (${repo}@${ref})`
        : '';
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}${hint}`);
  }
  return res.json();
}

async function runPool(items, worker) {
  let index = 0;
  const errors = [];
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      try {
        await worker(item);
      } catch (err) {
        errors.push(`${item.repoPath ?? item}: ${err.message}`);
      }
    }
  });
  await Promise.all(runners);
  return errors;
}

/**
 * @param {{repoPath: string, dest: string, allow404?: boolean}} job
 * @returns {Promise<'written'|'cached'|'absent'>}
 */
async function download(job) {
  if (!flags.force && fs.existsSync(job.dest)) return 'cached';
  const text = await fetchText(rawUrl(job.repoPath), { allow404: job.allow404 });
  if (text === null) return 'absent';
  JSON.parse(text); // fail fast on malformed payloads
  fs.mkdirSync(path.dirname(job.dest), { recursive: true });
  fs.writeFileSync(job.dest, text, 'utf8');
  return 'written';
}

/** Build the download list from the locally installed Cursor build. */
function jobsFromMetadata(locale, prefix, destRoot) {
  const jobs = [{
    repoPath: `${prefix}main.i18n.json`,
    dest: path.join(destRoot, 'main.i18n.json')
  }];
  for (const [id, info] of Object.entries(metadata.extensions)) {
    // Only extensions that externalize strings can have an upstream bundle.
    if (info.packageNlsKeyCount === 0) continue;
    jobs.push({
      repoPath: `${prefix}extensions/${id}.i18n.json`,
      dest: path.join(destRoot, 'extensions', `${id}.i18n.json`),
      allow404: true
    });
  }
  return jobs;
}

/** Build the download list by listing the upstream pack directory. */
async function jobsFromApi(locale, prefix, destRoot) {
  const tree = await fetchTree();
  if (tree.truncated) {
    log.warn('GitHub returned a truncated tree; pin upstream.ref to a tag if files turn out to be missing.');
  }
  const jobs = tree.tree
    .filter((n) => n.type === 'blob' && n.path.startsWith(prefix) && n.path.endsWith('.i18n.json'))
    .map((n) => ({
      repoPath: n.path,
      dest: path.join(destRoot, n.path.slice(prefix.length))
    }));
  return { jobs, sha: tree.sha };
}

async function main() {
  if (!locales.length) {
    log.err(`No enabled locale matched${flags.locale ? ` --locale=${flags.locale}` : ''}.`);
    return 1;
  }

  log.step(`Syncing translation baseline from ${repo}@${ref}`);

  let failed = false;
  let totalWritten = 0;

  for (const locale of locales) {
    if (!locale.upstreamPackDir) {
      log.warn(`${locale.id}: no upstreamPackDir configured, skipping (full mode unavailable for this locale).`);
      continue;
    }

    const prefix = `${locale.upstreamPackDir.replace(/\/+$/, '')}/translations/`;
    const destRoot = p('upstream', locale.id);
    if (flags.force) rmrf(destRoot);

    let jobs;
    let strategy = requestedStrategy;
    let treeSha = null;

    if (strategy === 'auto') strategy = metadata ? 'metadata' : 'api';
    if (strategy === 'metadata' && !metadata) {
      log.err('strategy=metadata requires metadata/cursor.json. Run `npm run extract` or use --strategy=api.');
      return 1;
    }

    if (strategy === 'metadata') {
      jobs = jobsFromMetadata(locale, prefix, destRoot);
      log.info(`${locale.id}: strategy=metadata, ${jobs.length} candidate file(s)`);
    } else {
      try {
        const result = await jobsFromApi(locale, prefix, destRoot);
        jobs = result.jobs;
        treeSha = result.sha;
      } catch (err) {
        log.err(`${locale.id}: ${err.message}`);
        failed = true;
        continue;
      }
      log.info(`${locale.id}: strategy=api, ${jobs.length} file(s)`);
    }

    if (!jobs.length) {
      log.err(`${locale.id}: nothing to download under ${prefix} in ${repo}@${ref}.`);
      failed = true;
      continue;
    }

    const counters = { written: 0, cached: 0, absent: 0 };
    const errors = await runPool(jobs, async (job) => {
      counters[await download(job)]++;
    });

    for (const message of errors) log.err(`  ${message}`);
    if (errors.length) {
      failed = true;
      continue;
    }

    if (!fs.existsSync(path.join(destRoot, 'main.i18n.json'))) {
      log.err(`${locale.id}: main.i18n.json was not downloaded; the baseline is unusable.`);
      failed = true;
      continue;
    }

    writeJson(path.join(destRoot, '.sync-info.json'), {
      repo,
      ref,
      resolvedSha: treeSha,
      strategy,
      packDir: locale.upstreamPackDir,
      files: counters.written + counters.cached,
      syncedAt: new Date().toISOString()
    });

    totalWritten += counters.written;
    log.ok(
      `${locale.id}: ${counters.written} downloaded, ${counters.cached} cached` +
      (counters.absent ? `, ${counters.absent} not available upstream` : '')
    );
  }

  log.plain(`\n${totalWritten} new file(s) in upstream/.`);
  return failed ? 1 : 0;
}

process.exitCode = await main();
