import test from 'node:test';
import assert from 'node:assert/strict';
import { TableHud, type SkillTile } from '../src/web/hud.ts';
import { huashenCards } from '../src/web/huashen-view.ts';
import { STANDARD_SKILL_HELP } from '../src/content/standard/skill-help.ts';
import { mountainScene } from './support/mountain-scenario.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision } from '../src/core/decision-manager.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';

class HudNode {
  children: HudNode[] = [];
  textContent = ''; className = ''; disabled = false; tabIndex = -1; src = ''; alt = '';
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  classes = new Set<string>();
  onclick?: () => void;
  onpointerenter?: () => void; onpointerleave?: () => void;
  onfocus?: () => void; onblur?: () => void;
  classList = {
    remove: (name: string) => { this.classes.delete(name); },
    add: (name: string) => { this.classes.add(name); },
    toggle: (name: string, enabled: boolean) => { if (enabled) this.classes.add(name); else this.classes.delete(name); },
  };
  append(...children: HudNode[]) { this.children.push(...children); }
  replaceChildren(...children: HudNode[]) { this.children = children; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
}
function withHud(run: (get: (id: string) => HudNode) => void) {
  const nodes = new Map<string, HudNode>();
  const get = (id: string) => { if (!nodes.has(id)) nodes.set(id, new HudNode()); return nodes.get(id)!; };
  const previous = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: get, createElement: () => new HudNode() } });
  try { run(get); } finally { Object.assign(globalThis, { document: previous }); }
}

test('急袭提示先选中央田，再选角色，确认后进入顺手牵羊选牌', () => withHud(get => {
  const x = mountainScene(5, 'junzheng', true);
  x.general(0, 'mountain.dengai');
  const field = x.f.take('sha');
  x.f.state.players[0].piles = { 'mountain.tuntian': [field] };
  x.f.state.players[0].gainedAbilities = ['mountain.jixi'];
  x.f.equip(3, 'tengjia', 'armor');
  const state = x.start(), obs = observe(state, 0);
  const model = new TableInteraction(decision(state)!, obs.self.hand);
  model.scope({ id: 'ui:mountain.jixi', label: '急袭', ability: 'mountain.jixi',
    cardIds: [], targetIds: [], children: model.leaves.filter(choice => choice.ability === 'mountain.jixi') });
  const hud = new TableHud(); let submitted = '';
  const render = () => hud.render(obs, model, false, [], choice => { submitted = choice.id; },
    () => {}, () => { model.clear(); render(); }, () => {});
  render();
  assert.match(get('prompt').textContent, /急袭.*先选择中央的一张田/);
  assert.match(get('drag-hint').textContent, /中央田牌/);
  assert.equal(get('play-action').disabled, true);
  assert.ok(model.selectCard(field)); render();
  assert.match(get('prompt').textContent, /急袭.*选择亮起的其他角色/);
  assert.equal(get('play-action').disabled, true);
  assert.ok(model.selectTarget(3)); render();
  assert.match(get('prompt').textContent, /急袭.*确认使用.*选择目标的一张牌/);
  assert.equal(get('play-action').disabled, false);
  get('play-action').onclick!();
  assert.equal(submitted, model.exact[0].id);
  get('cancel-action').onclick!();
  assert.equal(model.focus, null);
  assert.ok(!get('drag-hint').textContent.includes('田牌'));
  hud.dispose();
}));

test('固政只提供公开弃牌，提示归还与收余牌，选中和撤销后确认状态正确', () => withHud(get => {
  const x = mountainScene(5);
  x.general(0, 'mountain.zhangzhaozhanghong');
  x.f.state.active = 1; x.f.state.players[1].hp = 1;
  const ids = [x.f.hand(1, 'sha'), x.f.hand(1, 'shan'), x.f.hand(1, 'tao')];
  let state = x.tasks({ kind: 'phaseBefore', phase: 'discard' },
    { kind: 'phaseDiscard' }, { kind: 'phaseAfter', phase: 'discard' });
  for (const id of ids.slice(0, 2)) state = x.choose(state, d => d.type === 'discard' && d.cid === id);
  const obs = observe(state, 0), model = new TableInteraction(decision(state)!, obs.self.hand);
  assert.deepEqual(zonePickerChoices(obs, model).map(pick => [pick.zone, pick.card?.id]),
    ids.slice(0, 2).map(id => ['discard', id]));
  const hud = new TableHud(); let submitted = '';
  const render = () => hud.render(obs, model, false, [], choice => { submitted = choice.id; },
    () => {}, () => { model.clear(); render(); }, () => {});
  render();
  assert.match(get('prompt').textContent, /固政.*归还.*其余弃牌.*已选 0\/1/);
  assert.equal(get('play-action').disabled, true);
  assert.ok(model.selectCard(ids[0])); render();
  assert.deepEqual(model.targets, [1]);
  assert.equal(model.selectTarget(1), false, '固定归还对象无需再次选择或取消');
  assert.match(get('prompt').textContent, /已选 1\/1/);
  assert.equal(get('play-action').textContent, '确认归还');
  assert.equal(get('end-action').textContent, '不发动固政');
  assert.equal(get('play-action').disabled, false);
  get('cancel-action').onclick!();
  assert.equal(get('play-action').disabled, true);
  assert.ok(model.selectCard(ids[1])); render(); get('play-action').onclick!();
  assert.equal(submitted, model.exact[0].id);
  get('end-action').onclick!();
  assert.equal(submitted, model.scoped.find(choice => choice.actionType === 'pass')!.id);
  hud.dispose();
}));

test('技能铭牌可在可发动、被动、等待及对手行动时悬浮或键盘查看完整说明', () => withHud(get => {
  const x = mountainScene(); const state = x.start(), obs = observe(state, 0);
  const model = new TableInteraction(decision(state)!, obs.self.hand);
  const hud = new TableHud(); let activated = 0;
  const tile: SkillTile = { id: 'mountain.huashen', label: '化身', seal: '触发',
    detail: '等待触发时机', help: STANDARD_SKILL_HELP['mountain.huashen'],
    passive: true, active: false, selected: false, choose: () => { activated++; } };
  for (const [active, busy] of [[false, false], [true, false], [true, true]]) {
    hud.render(obs, model, busy, [{ ...tile, active }], () => {}, () => {}, () => {}, () => {});
    const wrapper = get('skill-actions').children[0], button = wrapper.children[0];
    assert.equal(button.disabled, busy || !active);
    assert.equal(wrapper.tabIndex, button.disabled ? 0 : -1);
    assert.equal(button.attributes['aria-describedby'], 'skill-tooltip');
    wrapper.onpointerenter!();
    assert.equal(get('skill-tooltip').classes.has('hidden'), false);
    assert.ok(get('skill-tooltip').textContent.includes(tile.help));
    assert.match(get('skill-tooltip').textContent, /等待触发时机/);
    assert.equal(activated, 0, '查看说明不发动技能');
    wrapper.onpointerleave!(); assert.ok(get('skill-tooltip').classes.has('hidden'));
    const focusTarget = button.disabled ? wrapper : button;
    focusTarget.onfocus!(); assert.equal(get('skill-tooltip').classes.has('hidden'), false);
    focusTarget.onblur!(); assert.ok(get('skill-tooltip').classes.has('hidden'));
  }
  hud.dispose(); assert.ok(get('skill-tooltip').classes.has('hidden'));
}));

test('化身牌列表展示本人全部化身、当前技能及可借用技能说明，过滤禁用种类', () => withHud(get => {
  const x = mountainScene(); x.general(0, 'mountain.zuoci');
  x.f.state.players[0].huashen = { generals: ['standard.guanyu', 'standard.zhugeliang', 'fire.pangtong', 'standard.liubei'],
    selected: 'standard.guanyu', ability: 'standard.wusheng' };
  const state = x.start(), obs = observe(state, 0);
  const cards = huashenCards(obs);
  assert.deepEqual(cards.map(card => card.label), ['关羽', '诸葛亮', '庞统', '刘备']);
  assert.equal(cards[0].skills[0].selected, true);
  assert.ok(cards.every(card => card.skills.every(skill => skill.help.length > 10)));
  assert.deepEqual(cards[1].skills.map(skill => skill.label), ['观星']);
  assert.deepEqual(cards[2].skills.map(skill => skill.label), ['连环']);
  assert.deepEqual(cards[3].skills.map(skill => skill.label), ['仁德']);
  assert.deepEqual(huashenCards(observe(state, 1)), [], '对手不能看到左慈的私有化身池');
  const hud = new TableHud({ 'standard.guanyu': '/assets/generals/standard.guanyu.png' });
  const render = () => hud.render(obs, null, true, [], () => {}, () => {}, () => {}, () => {});
  render();
  const panel = get('huashen-panel'), list = panel.children[2];
  assert.equal(panel.classes.has('hidden'), false);
  assert.equal(panel.children[0].textContent, '化身牌（4）');
  assert.equal(list.children.length, 4);
  assert.ok(list.children[0].classes.has('current'));
  assert.equal(list.children[0].children[0].children[0].src, '/assets/generals/standard.guanyu.png');
  assert.match(list.children[0].children[1].textContent, /武圣：.*红色牌/);
  render(); assert.equal(panel.children[2], list, '无变化的重绘保留展开与滚动状态');
  obs.self.huashen!.selected = 'standard.zhugeliang'; obs.self.huashen!.ability = 'standard.guanxing';
  render(); assert.ok(panel.children[2].children[1].classes.has('current'));
  obs.self.generalSkillsDisabled = true; render(); assert.match(panel.children[1].textContent, /断肠.*已失效/);
  hud.dispose(); assert.ok(panel.classes.has('hidden'));
}));

test('新生获得化身后即使在对手回合也刷新持有列表，对手视角不泄露新增化身', () => withHud(get => {
  const x = mountainScene(5); x.general(0, 'mountain.zuoci');
  x.f.state.players[0].huashen = { generals: ['standard.guanyu', 'standard.zhenji'],
    selected: 'standard.guanyu', ability: 'standard.wusheng' };
  let state = x.f.state; state.active = 1; state.phase = 'play';
  const hud = new TableHud();
  const render = () => hud.render(observe(state, 0), null, true, [], () => {}, () => {}, () => {}, () => {});
  render(); assert.equal(get('huashen-panel').children[2].children.length, 2);
  damage(state, 0, 1, 1, null); x.advance(state);
  state = x.choose(state, action => action.type === 'yes');
  render();
  assert.equal(get('huashen-panel').children[0].textContent, '化身牌（3）');
  assert.equal(get('huashen-panel').children[2].children.length, 3);
  assert.deepEqual(huashenCards(observe(state, 1)), []);
  assert.equal(observe(state, 1).others.find(player => player.id === 0)!.huashen!.generals, undefined);
}));
