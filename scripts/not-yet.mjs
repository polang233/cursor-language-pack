#!/usr/bin/env node
/**
 * Placeholder for pipeline commands that have not been ported from
 * kiro-language-pack yet. `npm run detect` is the only live script.
 */
const name = process.argv[2] ?? 'this command';
console.error(
  `'npm run ${name}' is not implemented yet.\n` +
  'This repository is a scaffold. The first working command is:\n' +
  '  npm run detect\n' +
  'Implementation plan: docs/roadmap.md'
);
process.exit(2);
