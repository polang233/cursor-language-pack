/**
 * Structural markers embedded in UI strings.
 *
 * These must survive translation byte for byte, otherwise the string renders
 * incorrectly at runtime: a stale `{2}` shows up as the literal text "{2}", a
 * translated `command:` target turns a link into dead text, and a missing
 * `$(icon)` leaves a gap where an icon should be.
 *
 * Upstream baselines drift, because microsoft/vscode-loc tracks the current VS Code
 * release while Cursor lags behind. Comparing markers against the English source
 * shipped inside the Cursor build is what catches that drift.
 */

const PATTERNS = {
  placeholder: /\{\d+\}/g,
  icon: /\$\([a-z0-9-~]+\)/gi,
  commandLink: /\(command:([^)\s]+)\)/g
};

const collect = (text, pattern) => (String(text).match(pattern) ?? []).sort();

/** @returns {{placeholder: string[], icon: string[], commandLink: string[]}} */
export function markersOf(text) {
  return {
    placeholder: collect(text, PATTERNS.placeholder),
    icon: collect(text, PATTERNS.icon),
    commandLink: collect(text, PATTERNS.commandLink)
  };
}

/**
 * Compare the markers of an English source string with its translation.
 * @returns {string[]} names of the marker kinds that differ; empty when compatible
 */
export function markerMismatches(source, translated) {
  if (typeof source !== 'string' || typeof translated !== 'string') return [];
  const a = markersOf(source);
  const b = markersOf(translated);
  return Object.keys(PATTERNS).filter((kind) => a[kind].join('\u0000') !== b[kind].join('\u0000'));
}

/** True when the translation is safe to ship for the given English source. */
export const markersMatch = (source, translated) => markerMismatches(source, translated).length === 0;
