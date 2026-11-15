import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { rewriteCommerce } from './lib/commerce-i18n.mjs';

const dictionary = JSON.parse(fs.readFileSync(new URL('../src/i18n/zh-cn/commerce.json', import.meta.url), 'utf8'));
const resources = Object.fromEntries(Object.entries(dictionary).filter(([key]) => key !== '$comment'));
const MARKER = '/* cursor-commerce-i18n */';
const pluralKey = '{count, plural, one {# top-up} other {# top-ups}} pending';
const markupKey = 'Your balance is already below <threshold>{threshold}</threshold>, so saving will immediately charge your payment method and add <amount>{amount}</amount> in credits.';

// Compare ICU syntax rather than just looking for matching brace names. Argument
// order may change in Chinese; branch selectors, tag nesting and # must survive.
function messageSignature(message) {
  let cursor = 0;
  const sorted = parts => parts.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), 'en'));
  function expect(text) {
    assert.ok(message.startsWith(text, cursor), `Expected ${text} at ${cursor}: ${message}`);
    cursor += text.length;
  }
  function spaces() { while (/\s/.test(message[cursor] ?? '') && cursor < message.length) cursor++; }
  function word(pattern) {
    const found = pattern.exec(message.slice(cursor));
    assert.ok(found, `Invalid ICU token at ${cursor}: ${message}`);
    cursor += found[0].length;
    return found[0];
  }
  function argument() {
    expect('{'); spaces();
    const name = word(/^[\w.]+/);
    spaces();
    if (message[cursor] === '}') { cursor++; return { argument: name }; }
    expect(','); spaces();
    const type = word(/^[a-z]+/);
    spaces();
    if (!['plural', 'selectordinal', 'select'].includes(type)) {
      assert.ok(['number', 'date', 'time'].includes(type), `Unsupported ICU type: ${type}`);
      const end = message.indexOf('}', cursor);
      assert.ok(end >= 0, `Unclosed ICU argument: ${message}`);
      const style = message.slice(cursor, end).trim();
      assert.ok(!style.includes('{'), `Invalid ICU style: ${message}`);
      cursor = end + 1;
      return { argument: name, type, style };
    }
    expect(','); spaces();
    let offset = null;
    if (message.startsWith('offset:', cursor)) { cursor += 7; spaces(); offset = word(/^\d+/); spaces(); }
    const branches = [];
    while (message[cursor] !== '}') {
      const selector = word(/^(?:=\d+|[A-Za-z]+)/);
      spaces(); expect('{');
      const body = parts(null, true, type !== 'select');
      expect('}'); spaces();
      assert.ok(!branches.some(branch => branch.selector === selector), `Duplicate ICU branch: ${selector}`);
      branches.push({ selector, body });
    }
    expect('}');
    assert.ok(branches.some(branch => branch.selector === 'other'), `ICU needs an other branch: ${message}`);
    return { argument: name, type, offset, branches: branches.sort((left, right) => left.selector.localeCompare(right.selector, 'en')) };
  }
  function parts(tag = null, brace = false, plural = false) {
    const result = [];
    while (cursor < message.length) {
      if (message[cursor] === '}' && brace) return sorted(result);
      if (tag && message.startsWith(`</${tag}>`, cursor)) { cursor += tag.length + 3; return sorted(result); }
      if (message.startsWith('</', cursor)) assert.fail(`Unexpected closing component: ${message}`);
      if (message[cursor] === '}') assert.fail(`Unexpected ICU brace: ${message}`);
      if (message[cursor] === "'") {
        if (message[cursor + 1] === "'") { cursor += 2; continue; }
        if (['{', '}', '#', '<'].includes(message[cursor + 1])) {
          cursor++;
          while (cursor < message.length) {
            if (message[cursor++] === "'") {
              if (message[cursor] === "'") cursor++;
              else break;
            }
          }
          continue;
        }
      }
      if (message[cursor] === '{') { result.push(argument()); continue; }
      if (message[cursor] === '<') {
        const opening = /^<([A-Za-z][\w-]*)>/.exec(message.slice(cursor));
        assert.ok(opening, `Invalid component tag: ${message}`);
        cursor += opening[0].length;
        result.push({ component: opening[1], body: parts(opening[1], false, plural) });
        continue;
      }
      if (message[cursor] === '#' && plural) result.push({ pound: true });
      cursor++;
    }
    assert.equal(tag, null, `Unclosed component ${tag}: ${message}`);
    assert.equal(brace, false, `Unclosed ICU branch: ${message}`);
    return sorted(result);
  }
  return parts();
}

function fixture({ alias = 'KU', map = 'n', instance = 'r', ready = 'o', locale = 'e', copy = 't', key = 's', value = 'm', language = 'i', getter = 'Hg', allowed = 'GU', namespace = 'uie' } = {}) {
  return `const SDK_TEXT="Save";const API_ID="PAYMENT_METHOD_REQUIRED";
function sdk(){throw new Error("The request could not be completed")}
const css=\`Save { color: red; }\`;
const price={amount:123456789,currencyCode:"USD"};
async function ${alias}(${locale},${copy}){const{instance:${instance},ready:${ready}}=${getter}(${locale});if(await ${ready},!${instance}.isInitialized)return;const ${map}={};for(const[${key},${value}]of Object.entries(${copy}))${allowed}(${key})&&typeof ${value}=="string"&&${value}.length>0&&(${map}[${key}]=${value});if(Object.keys(${map}).length===0)return;const ${language}=${instance}.resolvedLanguage??${instance}.language;${instance}.addResourceBundle(${language},${namespace},${map},!0,!0),${instance}.services.i18nFormat?.clearCache?.()}a(${alias},"applyCursorCommerceCopy");
export{${alias} as applyCursorCommerceCopy};`;
}

function extractFunction(source, alias) {
  const start = source.indexOf(`async function ${alias}(`);
  const end = source.indexOf(`}a(${alias},"applyCursorCommerceCopy")`, start);
  assert.ok(start >= 0 && end >= start, 'Fixture function boundaries must be present');
  return source.slice(start, end + 1);
}

function fakeI18n({ resolvedLanguage = 'en', language = 'fallback', initialized = true, cache = true } = {}) {
  const calls = [];
  const stored = new Map();
  let cleared = 0;
  const instance = {
    isInitialized: initialized, resolvedLanguage, language,
    addResourceBundle(activeLanguage, namespace, map, deep, overwrite) {
      assert.equal(this, instance);
      assert.equal(deep, true);
      assert.equal(overwrite, true);
      calls.push([activeLanguage, namespace, { ...map }, deep, overwrite]);
      stored.set(`${activeLanguage}/${namespace}`, { ...stored.get(`${activeLanguage}/${namespace}`), ...map });
    },
    services: cache ? { i18nFormat: { clearCache() { assert.equal(calls.length, 1); cleared++; } } } : {}
  };
  return { instance, calls, stored, get cleared() { return cleared; } };
}

function runnable(source, { alias = 'KU', getter = 'Hg', allowed = 'GU', namespace = 'uie' } = {}, obtain) {
  return new Function(getter, allowed, namespace, `return (${extractFunction(source, alias)});`)(
    obtain, key => ['Save', 'Monthly usage', 'Untouched', 'Blank', 'Not a string'].includes(key), 'translation'
  );
}

function checkSingleInsertion(original, rewritten) {
  const at = rewritten.indexOf(MARKER);
  assert.ok(at >= 0);
  assert.equal(rewritten.indexOf(MARKER, at + MARKER.length), -1);
  const length = rewritten.length - original.length;
  assert.ok(length > 0);
  assert.equal(rewritten.slice(0, at) + rewritten.slice(at + length), original);
  assert.ok(rewritten.slice(at + length).startsWith('if(Object.keys('));
  return { at, insertion: rewritten.slice(at, at + length) };
}

test('flat commerce dictionary preserves every ICU argument, plural branch, pound and component', () => {
  assert.ok(Object.keys(resources).length > 100);
  for (const [english, translated] of Object.entries(resources)) {
    assert.equal(typeof translated, 'string', english);
    assert.ok(translated.trim() && translated !== english, english);
    assert.deepEqual(messageSignature(translated), messageSignature(english), english);
  }
  for (const key of ['Save', 'Cancel', 'Done', 'Amount', 'Credits', 'Payment methods', 'Set a monthly limit for usage credits', pluralKey, markupKey]) {
    assert.ok(Object.hasOwn(resources, key), key);
  }
  for (const forbidden of ['PAYMENT_METHOD_REQUIRED', 'xai-commerce-prepaid: baseUrl is not a URL', 'createCheckoutSession', 'USD', 'Subscribe to X Premium']) {
    assert.ok(!Object.hasOwn(resources, forbidden), forbidden);
  }
});

test('Japanese commerce preserves ICU arguments, components and actual resource injection', async () => {
  const japanese = JSON.parse(fs.readFileSync(new URL('../src/i18n/ja/commerce.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(japanese).sort(), Object.keys(resources).sort());
  for (const [english, value] of Object.entries(japanese)) {
    assert.ok(typeof value === 'string' && value.trim(), english);
    assert.deepEqual(messageSignature(value), messageSignature(english), english);
  }
  const fake = fakeI18n({ resolvedLanguage: 'ja' });
  await runnable(rewriteCommerce(fixture(), japanese).text, {}, () => ({ instance: fake.instance, ready: Promise.resolve() }))('ja', {});
  assert.equal(fake.calls[0][2]['Buy credits'], 'クレジットを購入');
  assert.equal(fake.calls[0][2]['Auto top-up'], '自動チャージ');
});

test('Traditional Chinese has the same message keys and preserves every ICU and component reference', async () => {
  const traditional = JSON.parse(fs.readFileSync(new URL('../src/i18n/zh-tw/commerce.json', import.meta.url), 'utf8'));
  const translated = Object.fromEntries(Object.entries(traditional).filter(([key]) => key !== '$comment'));
  assert.deepEqual(Object.keys(translated).sort(), Object.keys(resources).sort());
  for (const [english, value] of Object.entries(translated)) {
    assert.equal(typeof value, 'string', english);
    assert.ok(value.trim() && value !== english, english);
    assert.deepEqual(messageSignature(value), messageSignature(english), english);
  }
  const fake = fakeI18n();
  const result = rewriteCommerce(fixture(), translated);
  await runnable(result.text, {}, () => ({ instance: fake.instance, ready: Promise.resolve() }))('en', {});
  assert.equal(fake.calls[0][2]['Buy credits'], '購買額度');
  assert.equal(fake.calls[0][2]['Auto top-up'], '自動儲值');
});

test('syntax comparison detects lost, renamed and moved ICU or component references', () => {
  assert.notDeepEqual(messageSignature('已充值。余额 {balance}'), messageSignature('Added {amount}. Your balance is now {balance}.'));
  assert.notDeepEqual(messageSignature('<amount>{amount}</amount>'), messageSignature('<threshold>{amount}</threshold>'));
  assert.notDeepEqual(messageSignature('<amount>金额</amount>{amount}'), messageSignature('<amount>{amount}</amount>'));
  assert.notDeepEqual(messageSignature('{count, plural, other {# 笔}}'), messageSignature(pluralKey));
  assert.notDeepEqual(messageSignature('{count, plural, one {一笔} other {多笔}}'), messageSignature(pluralKey));
  assert.throws(() => messageSignature('{count, plural, one {# 笔}}'), /other branch/);
  assert.throws(() => messageSignature('{amount'), /Expected/);
  assert.throws(() => messageSignature('<threshold>{amount}'), /Unclosed component/);
  assert.throws(() => messageSignature('{count, plural, one {#} other {#}'), /Invalid ICU token/);
  assert.deepEqual(messageSignature('{count, plural, offset:1 =0 {None} one {{amount}} other {<amount># {amount}</amount>}}'),
    messageSignature('{count, plural, offset:1 =0 {无} one {{amount}} other {<amount>{amount} #</amount>}}'));
});

test('executes the rewritten function: the real addResourceBundle receives all Chinese resources over host English copy', async () => {
  const source = fixture();
  const result = rewriteCommerce(source, dictionary);
  checkSingleInsertion(source, result.text);
  assert.equal(result.count, Object.keys(resources).length);
  assert.deepEqual([...result.hits], Object.keys(resources).map(key => [key, 1]));
  const fake = fakeI18n();
  const apply = runnable(result.text, {}, () => ({ instance: fake.instance, ready: Promise.resolve() }));
  await apply('en', { Save: 'Save from host', 'Monthly usage': 'Monthly additional usage', Untouched: 'Kept host copy', Blank: '', 'Not a string': 2, 'Rejected key': 'Rejected copy' });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.cleared, 1);
  const [language, namespace, received] = fake.calls[0];
  assert.equal(language, 'en');
  assert.equal(namespace, 'translation');
  assert.deepEqual(received, { Untouched: 'Kept host copy', ...resources });
  assert.deepEqual(fake.stored.get('en/translation'), received);
  assert.equal(received.Save, '保存');
  assert.equal(received['Monthly usage'], '本月额外用量费用');
  for (const [english, translated] of Object.entries(resources)) {
    assert.equal(received[english], translated);
    assert.deepEqual(messageSignature(received[english]), messageSignature(english), english);
  }
  assert.ok(!Object.hasOwn(received, '$comment'));
  assert.ok(!Object.hasOwn(received, 'Rejected key'));
});

test('resources are inserted before the empty-map return, even when the host supplied no copy', async () => {
  const result = rewriteCommerce(fixture(), dictionary);
  const fake = fakeI18n({ resolvedLanguage: null, language: 'en', cache: false });
  const apply = runnable(result.text, {}, () => ({ instance: fake.instance, ready: Promise.resolve() }));
  await apply('en', {});
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.stored.get('en/translation'), resources);
});

test('keeps the initialization await and the uninitialized-instance early return', async () => {
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const fake = fakeI18n();
  const apply = runnable(rewriteCommerce(fixture(), dictionary).text, {}, () => ({ instance: fake.instance, ready }));
  const pending = apply('en', {});
  assert.equal(fake.calls.length, 0);
  resolveReady();
  await pending;
  assert.equal(fake.calls.length, 1);
  const uninitialized = fakeI18n({ initialized: false });
  await runnable(rewriteCommerce(fixture(), dictionary).text, {}, () => ({ instance: uninitialized.instance, ready: Promise.resolve() }))('en', {});
  assert.equal(uninitialized.calls.length, 0);
});

test('follows changed export aliases, map and all local binding names', async () => {
  const names = { alias: '$apply2', map: 'copyMap', instance: 'i18n', ready: '$ready', locale: '$locale', copy: 'hostCopy', key: 'english', value: 'text', language: 'activeLanguage', getter: 'getCommerce', allowed: 'isAllowed', namespace: 'ns' };
  const source = fixture(names);
  const result = rewriteCommerce(source, dictionary);
  assert.ok(result.text.includes(`${MARKER}Object.assign(copyMap,`));
  checkSingleInsertion(source, result.text);
  const fake = fakeI18n({ resolvedLanguage: 'zh-cn' });
  await runnable(result.text, names, locale => { assert.equal(locale, 'en'); return { instance: fake.instance, ready: Promise.resolve() }; })('en', {});
  assert.deepEqual(fake.stored.get('zh-cn/translation'), resources);
});

test('does not replace SDK literals, identifiers, prices, currencies, styles or decoy anchors', () => {
  const decoys = `/* export { missing as applyCursorCommerceCopy }; async function KU(){} */
const diagnostic='export { missing as applyCursorCommerceCopy };';
const template=\`export { missing as applyCursorCommerceCopy }; \${\`nested \${"}"}\`}\`;
const expression=/export\\{[{}"']+\\/missing/g;const divided=12/3/2;
class Private{#value=1;get(){return this.#value}}
const names={\\u0421\\u0435\\u0432:1};
`;
  const source = decoys + fixture();
  const result = rewriteCommerce(source, { Save: '保存', 'The request could not be completed': '无法完成请求' });
  assert.ok(result.text.startsWith(decoys));
  const { at } = checkSingleInsertion(source, result.text);
  assert.equal(result.text.slice(0, at), source.slice(0, at));
  assert.ok(result.text.includes('const SDK_TEXT="Save"'));
  assert.ok(result.text.includes('throw new Error("The request could not be completed")'));
  assert.ok(result.text.includes('currencyCode:"USD"'));
});

test('whitespace, comments and single-quoted type checks do not pin minifier formatting', async () => {
  const source = fixture().replace('async function KU', 'async /* name */ function KU')
    .replace('typeof m=="string"', "typeof m == 'string'")
    .replace('const n={};', 'const n = { }; /* filtered host copy follows */');
  const result = rewriteCommerce(source, dictionary);
  checkSingleInsertion(source, result.text);
  const fake = fakeI18n();
  // The fixture extractor intentionally uses a plain declaration boundary.
  const normalized = result.text.replace('async /* name */ function KU', 'async function KU');
  await runnable(normalized, {}, () => ({ instance: fake.instance, ready: Promise.resolve() }))('en', {});
  assert.deepEqual(fake.stored.get('en/translation'), resources);
});

test('empty or comment-only dictionaries are a no-op, without requiring commerce anchors', () => {
  for (const dict of [{}, { $comment: 'No translations' }, Object.create(null)]) {
    const result = rewriteCommerce('const SDK="Save";', dict);
    assert.equal(result.text, 'const SDK="Save";');
    assert.equal(result.count, 0);
    assert.ok(result.hits instanceof Map);
    assert.equal(result.hits.size, 0);
  }
});

test('does not mutate the dictionary and safely serializes quotes, slashes, newlines and Unicode separators', async () => {
  const dict = Object.freeze({ Save: '保存 "引号" \\ 路径\n换行\u2028分隔\u2029结束' });
  const fake = fakeI18n();
  const result = rewriteCommerce(fixture(), dict);
  assert.ok(!result.text.includes('\u2028'));
  assert.ok(!result.text.includes('\u2029'));
  await runnable(result.text, {}, () => ({ instance: fake.instance, ready: Promise.resolve() }))('en', {});
  assert.equal(fake.calls[0][2].Save, dict.Save);
  assert.deepEqual(rewriteCommerce(fixture(), dict), result);
});

test('invalid dictionaries are rejected', () => {
  for (const dict of [null, [], new Map(), new Date(), { Save: 2 }, { Save: '' }, { Save: ' ' }, { '': '保存' }, JSON.parse('{"__proto__":"危险"}')]) {
    assert.throws(() => rewriteCommerce(fixture(), dict), /commerce-i18n: (dictionary|invalid translation)/);
  }
  assert.throws(() => rewriteCommerce(null, resources), /source must be a string/);
});

test('missing exports, missing function and changed resource or filtering structures fail closed', () => {
  const source = fixture();
  const cases = [
    source.replace('export{KU as applyCursorCommerceCopy};', ''),
    source.replace('KU as applyCursorCommerceCopy', 'KU as somethingElse'),
    source.replace('async function KU', 'function KU'),
    source.replace('const n={};', 'const n=[];'),
    source.replace('Object.keys(n).length===0', 'Object.keys(n).length!==0'),
    source.replace('Object.entries(t)', 'Object.entries(e)'),
    source.replace('n[s]=m', 'n[s]=s'),
    source.replace('uie,n,!0,!0', 'uie,t,!0,!0'),
    source.replace('uie,n,!0,!0', 'uie,n,!0,!1'),
    source.replace('r.addResourceBundle', 'other.addResourceBundle'),
    source.replace('r.resolvedLanguage??r.language', 'r.resolvedLanguage'),
    source.replace('return;const n', 'return;sideEffect();const n'),
    source.replace('export{KU as applyCursorCommerceCopy};', 'export{KU as applyCursorCommerceCopy}from"somewhere";')
  ];
  for (const changed of cases) assert.throws(() => rewriteCommerce(changed, resources), /commerce-i18n:/);
});

test('ambiguous exports, duplicate functions and extra resource anchors are rejected', () => {
  const source = fixture();
  for (const changed of [
    source + '\nexport{other as applyCursorCommerceCopy};',
    source.replace('export{KU as', 'export{other as applyCursorCommerceCopy,KU as'),
    source + '\n' + extractFunction(source, 'KU'),
    source.replace('const i=r.resolvedLanguage', 'if(Object.keys(n).length===0)return;const i=r.resolvedLanguage'),
    source.replace('r.addResourceBundle(i,uie,n,!0,!0)', 'r.addResourceBundle(i,uie,n,!0,!0),r.addResourceBundle(i,uie,n,!0,!0)')
  ]) assert.throws(() => rewriteCommerce(changed, resources), /commerce-i18n:/);
  assert.throws(() => rewriteCommerce(rewriteCommerce(source, resources).text, resources), /already rewritten/);
});

const actualSource = process.env.CURSOR_COMMERCE_SOURCE;
test('read-only actual bundle: one insertion, all dictionary keys present and node --check without executing the bundle', { skip: !actualSource }, () => {
  const source = fs.readFileSync(actualSource, 'utf8');
  const result = rewriteCommerce(source, dictionary);
  checkSingleInsertion(source, result.text);
  assert.equal(result.count, Object.keys(resources).length);
  for (const english of Object.keys(resources)) {
    const literal = JSON.stringify(english);
    const escaped = literal.replace(/[^\x00-\x7f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}`);
    assert.ok(source.includes(literal) || source.toLowerCase().includes(escaped.toLowerCase()), `Dictionary key missing in actual bundle: ${english}`);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-commerce-check-'));
  try {
    const processed = path.join(temp, 'commerce.mjs');
    fs.writeFileSync(processed, result.text);
    const checked = spawnSync(process.execPath, ['--check', processed], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr || checked.error?.message);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  assert.equal(fs.readFileSync(actualSource, 'utf8'), source);
});
