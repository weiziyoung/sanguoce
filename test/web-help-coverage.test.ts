import test from 'node:test';
import assert from 'node:assert/strict';
import { standardPack } from '../src/content/standard/content.ts';
import { STANDARD_SKILL_HELP } from '../src/content/standard/skill-help.ts';
import { STANDARD_EQUIPMENT_HELP } from '../src/content/standard/equipment-help.ts';

test('所有可选武将技能与标准装备都有悬停说明', () => {
  const missingSkills = standardPack.generals.flatMap(general =>
    general.abilities.filter(id => !STANDARD_SKILL_HELP[id]).map(id => `${general.label}:${id}`));
  const missingEquipment = standardPack.cards.filter(card => card.kind === 'equip' &&
    !STANDARD_EQUIPMENT_HELP[card.id]).map(card => card.id);
  assert.deepEqual(missingSkills, []);
  assert.deepEqual(missingEquipment, []);
});
