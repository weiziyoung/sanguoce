import { allContent } from '../app/game-content.ts';
import { STANDARD_SKILL_HELP } from '../content/standard/skill-help.ts';
import type { AssetManifest } from './assets.ts';

const GROUPS = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };

export function selectionDetails(id: string, lordSkillsAvailable: boolean) {
  const general = allContent.general(id);
  return {
    title: `${general.label} · ${GROUPS[general.group ?? 'qun']} · 体力 ${general.hp}`,
    skills: general.abilities.map(ability => {
      const skill = allContent.requireSkill(ability);
      return { title: `${skill.label ?? ability}${skill.lordSkill ? ' · 主公技' : ''}`,
        body: STANDARD_SKILL_HELP[ability] ?? '技能详情暂缺',
        unavailable: Boolean(skill.lordSkill && !lordSkillsAvailable) };
    }),
  };
}

/** Selection has its own panel because the table HUD remains hidden before a game starts. */
export class SelectionPreview {
  private box = document.createElement('aside');
  constructor() {
    this.box.className = 'selection-preview hidden';
    this.box.setAttribute('aria-label', '武将技能详情');
    document.getElementById('app')!.append(this.box);
  }

  show(id: string, x: number, width: number, lordSkillsAvailable: boolean): void {
    const details = selectionDetails(id, lordSkillsAvailable);
    const title = document.createElement('strong');
    title.textContent = details.title;
    this.box.replaceChildren(title, ...details.skills.map(skill => {
      const section = document.createElement('section');
      const label = document.createElement('b'); label.textContent = skill.title;
      const body = document.createElement('p'); body.textContent = skill.body;
      section.append(label, body);
      if (skill.unavailable) {
        const note = document.createElement('small'); note.textContent = '本局身份／模式下不可用';
        section.append(note);
      }
      return section;
    }));
    const right = x + width / 2 + 18;
    const left = right + 400 <= 1580 ? right : x - width / 2 - 418;
    this.box.style.left = `${Math.max(20, left) / 16}%`;
    this.box.classList.remove('hidden');
  }

  hide(): void { this.box.classList.add('hidden'); }
  dispose(): void { this.box.remove(); }
}

export function selectionVoice(id: string, manifest: AssetManifest): string | undefined {
  const voices = manifest.generalAudio[id];
  return voices?.selection ?? Object.values(voices?.skills ?? {})[0]?.[0];
}
