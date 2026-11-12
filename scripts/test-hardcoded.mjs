import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { rewrite } from './translate-install.mjs';

const issue5Copy = {
  'zh-cn': ['搜索操作…', '搜索智能体…', '搜索智能体', '编辑器窗口', '水平拆分面板', '垂直拆分面板', '从面板组移除', '固定 / 取消固定智能体'],
  'zh-tw': ['搜尋操作…', '搜尋智慧體…', '搜尋智慧體', '編輯器視窗', '水平分割面板', '垂直分割面板', '從面板群組移除', '固定 / 取消固定智慧體']
};
const issue5Keys = ['Search actions...', 'Search Agents...', 'Search Agents', 'Editor Window',
  'Split Tile Horizontally', 'Split Tile Vertically', 'Remove from Tileset', 'Pin / Unpin Agent'];

for (const locale of ['zh-cn', 'zh-tw']) {
  const dictionary = JSON.parse(fs.readFileSync(new URL(`../src/i18n/${locale}/hardcoded.json`, import.meta.url), 'utf8'));

  test(`${locale}: 动作面板覆盖精确大小写和省略号，并保留搜索元数据`, () => {
    const source = 'const input={placeholder:"Search Agents...","aria-label":"Search agents"};'
      + 'const commands=[{id:"search.agents",title:"Search Agents",keywords:["Search agents","Search Agents"]},'
      + '{id:"split.horizontal",title:"Split Tile Horizontally"},{id:"split.vertical",title:"Split Tile Vertically"},'
      + '{id:"tile.remove",title:"Remove from Tileset"},{id:"agent.pin",title:"Pin / Unpin Agent"}];'
      + 'function placeholder(t){return t.isActionsOnly?"Search actions...":"unrelated"}'
      + 'function windowTitle(){return "Editor Window"}'
      + '[input,commands,placeholder({isActionsOnly:true}),windowTitle()];';
    const result = rewrite(source, dictionary);
    const [input, commands, search, window] = vm.runInNewContext(result.text);
    const [actions, agentsEllipsis, agents, editor, horizontal, vertical, remove, pin] = issue5Copy[locale];
    assert.equal(input.placeholder, agentsEllipsis);
    assert.equal(input['aria-label'], dictionary['Search agents']);
    assert.equal(commands[0].title, agents);
    assert.equal(commands[0].id, 'search.agents');
    assert.equal(JSON.stringify(commands[0].keywords), '["Search agents","Search Agents"]');
    assert.equal(JSON.stringify(commands.slice(1).map(item => item.title)), JSON.stringify([horizontal, vertical, remove, pin]));
    assert.equal(search, actions);
    assert.equal(window, editor);
    for (const key of issue5Keys) assert.ok(result.hits.has(key), key);
    assert.equal(rewrite(result.text, dictionary).text, result.text);
  });

  test(`${locale}: 新旧设置侧栏标题均可翻译，路由和图标名保持原样`, () => {
    const source = 'const current={voice:"Voice","git-prs":"Source Control"};'
      + 'const legacy={"git-prs":"Git & PRs"};'
      + 'const icons={voice:"mic","git-prs":"git-pull-request"};'
      + 'const protocol={source:"Source Control"};[current,legacy,icons,protocol];';
    const [current, legacy, icons, protocol] = vm.runInNewContext(rewrite(source, dictionary).text);
    assert.equal(current.voice, dictionary.Voice);
    assert.equal(current['git-prs'], dictionary['Source Control']);
    assert.equal(legacy['git-prs'], dictionary['Git & PRs']);
    assert.equal(JSON.stringify(icons), '{"voice":"mic","git-prs":"git-pull-request"}');
    assert.equal(protocol.source, 'Source Control');
  });

  test(`${locale}: 完整面板标签表翻译显示值并保留筛选键`, () => {
    for (const project of ['', 'projects:"Projects",']) {
      const source = 'const tabs={all:"All",' + project + 'agents:"Agents",files:"Files",actions:"Actions",settings:"Settings"};'
        + 'const other={all:"All",files:"Files",actions:"Actions",settings:"Settings"};[tabs,other];';
      const result = rewrite(source, dictionary);
      const [tabs, other] = vm.runInNewContext(result.text);
      for (const key of Object.keys(tabs)) {
        const english = { all: 'All', projects: 'Projects', agents: 'Agents', files: 'Files', actions: 'Actions', settings: 'Settings' }[key];
        assert.equal(tabs[key], dictionary[english], key);
      }
      assert.equal(JSON.stringify(other), '{"all":"All","files":"Files","actions":"Actions","settings":"Settings"}');
      assert.equal(rewrite(result.text, dictionary).text, result.text);
    }
  });

  test(`${locale}: PR 设置编译后的标题常量可翻译，并保留设置 ID`, () => {
    const source = 'const group={Root:"root",Entry:"entry"},settings={providerDescription:"description"},aliases=["pull request"],select="select";'
      + 'var heading$="Pull Requests",root$=group.Root,accessible$="Pull Requests",id$="pull-request-preferences",'
      + 'entry$=group.Entry,description$=settings.providerDescription,label$="Review Provider",aliases$=aliases,select$=select,aria$="Review Provider";'
      + 'const unrelated="Pull Requests";'
      + '[{title:heading$,accessibleLabel:accessible$,id:id$,label:label$,"aria-label":aria$,description:description$,searchAliases:aliases$},unrelated];';
    const dict = { ...dictionary, 'pull-request-preferences': 'not a display label' };
    const result = rewrite(source, dict);
    const [view, unrelated] = vm.runInNewContext(result.text);
    assert.equal(view.title, dictionary['Pull Requests']);
    assert.equal(view.accessibleLabel, dictionary['Pull Requests']);
    assert.equal(view.label, dictionary['Review Provider']);
    assert.equal(view['aria-label'], dictionary['Review Provider']);
    assert.equal(view.id, 'pull-request-preferences');
    assert.equal(view.description, 'description');
    assert.equal(JSON.stringify(view.searchAliases), '["pull request"]');
    assert.equal(unrelated, 'Pull Requests');
    assert.equal(result.count, 4);
    for (const changed of [source.replace('"pull-request-preferences"', '"other-preferences"'), source.replace('group.Root', 'group.Unrelated')]) {
      assert.equal(rewrite(changed, dict).count, 0);
    }
    assert.equal(rewrite(result.text, dict).text, result.text);
  });
}

test('the commerce card title is translated without changing its locale, import, variables or returned data', () => {
  const before = 'var header="Credits",locale="en";function load(){return import("./workbench.xai-commerce-prepaid.js")}function render(){return {title:header,locale:locale,component:"plan-usage-credits-card",amount:12345}};render();';
  const after = rewrite(before, { Credits: '用量额度' });
  assert.equal(after.count, 1);
  const result = vm.runInNewContext(after.text);
  assert.equal(result.title, '用量额度');
  assert.equal(result.locale, 'en');
  assert.equal(result.amount, 12345);
  assert.ok(after.text.includes('import("./workbench.xai-commerce-prepaid.js")'));
});

test('the commerce header matcher supports minifier aliases but refuses unrelated strings and incomplete context', () => {
  const alias = 'let $h="Credits",$l="en";import("./workbench.xai-commerce-prepaid.js");const props={title:$h,locale:$l,component:"plan-usage-credits-card"};';
  assert.equal(rewrite(alias, { Credits: '用量額度' }).count, 1);
  const glass = 'function load(){return import("./workbench.xai-commerce-prepaid.js")}function render(){return {title:h$,locale:l$,component:"plan-usage-credits-card"}}var h$,l$,init=(()=>{h$="Credits",l$="en"})();render();';
  assert.equal(vm.runInNewContext(rewrite(glass, { Credits: '用量額度' }).text).title, '用量額度');
  for (const source of [
    'var header="Credits",locale="en";console.log(header);',
    'var header="Credits",locale="en";import("./workbench.xai-commerce-prepaid.js");const props={title:other};',
    'var header="Credits",locale="en";const props={title:header};',
    'const message="Credits";const id="Credits";'
  ]) assert.equal(rewrite(source, { Credits: '用量额度' }).text, source);
});

test('queue editing labels and screen recording status keep dispatch and protocol identifiers', () => {
  const source = 'const views={queueItem:()=>({bannerLabel:"Editing queued message",placeholder:"Editing queued message...",cancelLabel:"Cancel",pillLabel:"Editing",pillTitle:"Editing queued message"})};const statuses={recordScreenToolCall:{loading:"Recording screen",completed:"Recorded screen",error:"Record screen"}};const other={loading:"Recording screen",id:"queue-item"};[views.queueItem(),statuses,other];';
  const dict = { 'Editing queued message': '正在编辑排队消息', 'Editing queued message...': '正在编辑排队消息…', Cancel: '取消', Editing: '正在编辑', 'Recording screen': '正在录制屏幕', 'Recorded screen': '已录制屏幕', 'Record screen': '录制屏幕' };
  const [view, statuses, other] = vm.runInNewContext(rewrite(source, dict).text);
  assert.equal(view.bannerLabel, '正在编辑排队消息');
  assert.equal(view.pillLabel, '正在编辑');
  assert.equal(view.cancelLabel, '取消');
  assert.equal(statuses.recordScreenToolCall.loading, '正在录制屏幕');
  assert.equal(other.loading, 'Recording screen');
  assert.equal(other.id, 'queue-item');
});

test('computer permission constants change only beside the complete component signature', () => {
  const block = 'a="Enable Computer Use",b="Allow Cursor to use your computer.",c="Cursor Computer Use is not available in this build",d="Back to Cursor",e="Computer Use is ready",f="Allow",g="Allowing\\u2026",h="Ready",items=[{kind:"accessibility",label:"Access app interfaces"}]';
  const dict = { 'Enable Computer Use': '启用计算机操作', 'Allow Cursor to use your computer.': '允许 Cursor 操作你的计算机。', 'Cursor Computer Use is not available in this build': '此版本不支持 Cursor 计算机操作', 'Back to Cursor': '返回 Cursor', 'Computer Use is ready': '计算机操作已就绪', Allow: '允许', 'Allowing…': '正在允许…', Ready: '就绪' };
  const source = 'var ' + block + ';[a,f,g,h,items[0].kind];';
  const result = vm.runInNewContext(rewrite(source, dict).text);
  assert.equal(result[0], '启用计算机操作');
  assert.equal(result[1], '允许');
  assert.equal(result[2], '正在允许…');
  assert.equal(result[3], '就绪');
  assert.equal(result[4], 'accessibility');
  assert.equal(rewrite('const label="Allow",state="Ready";', dict).count, 0);
});
