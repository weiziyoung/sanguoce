import test from 'node:test';
import assert from 'node:assert/strict';
import { observe, decision } from '../engine.ts';
import { NAMES } from '../catalog.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { fixture } from './support/scenario-builder.ts';

test('所有标准装备能力提供中文展示名称，触发和能力名称一致', () => {
  for (const card of standardContent.cards().filter(card => card.kind === 'equip')) {
    for (const id of card.abilities ?? []) {
      const skill = standardContent.requireSkill(id);
      assert.match(skill.label ?? '', /[\u4e00-\u9fff]/u, `${card.label}的能力缺少中文名称`);
      if (skill.trigger) assert.equal(skill.trigger.label, skill.label);
    }
  }
});

for (const [name, timing] of [
  ['cixiong', 'attackTargeted'], ['renwang', 'attackTargeted'],
  ['qinglong', 'attackMissed'], ['guanshi', 'attackMissed'],
  ['hanbing', 'beforeAttackDamage'], ['qilin', 'beforeAttackDamage'],
] as const) {
  test(`${NAMES[name]}的真实触发向 Web 动画、日志和决策提供中文名称`, () => {
    const f = fixture();
    const sha = f.hand(0, 'sha', 'spade');
    f.hand(0, 'tao');
    f.hand(1, 'shan');
    f.equip(name === 'renwang' ? 1 : 0, name, name === 'renwang' ? 'armor' : 'weapon');
    if (name === 'qilin') f.equip(1, 'jueying', 'plusHorse');
    const runtime = new ContentRuntime(standardContent);
    resolutionStack.enqueue(f.state, { kind: 'openTriggers', signal: {
      kind: timing, data: { source: 0, target: 1, sha, ignoreDistance: false },
    }, then: [] });
    createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
    const obs = observe(f.state, 0);
    const event = obs.events.find(event => event.kind === 'skillActivated' &&
      event.data.ability === `standard.${name}`);
    assert.ok(event?.kind === 'skillActivated');
    assert.equal(event.data.label, NAMES[name], '发动动画直接使用事件名称');
    assert.ok(obs.log.some(line => line.includes(`发动【${NAMES[name]}】`)));
    assert.ok(obs.log.every(line => !line.includes('standard.')));
    const prompt = decision(f.state);
    if (name !== 'renwang') {
      assert.ok(prompt);
      assert.ok(prompt.title.includes(NAMES[name]));
      assert.ok([prompt.title, ...prompt.options.map(option => option.label)]
        .every(label => !label.includes('standard.')));
    }
  });
}
