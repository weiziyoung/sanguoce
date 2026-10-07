import type { Observation } from '../../contracts.ts';
import type { ActionChoice } from '../presentation/choice-view.ts';
import type { TableInteraction } from './interaction-model.ts';

const PHASES: Record<string, string> = { setup: '准备', start: '开始', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束', finished: '终局' };
export const node = (id: string) => document.getElementById(id)!;
export function button(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button'); b.textContent = label; b.disabled = disabled; b.onclick = action; return b;
}
export function contextActionChoices(model: TableInteraction | null): ActionChoice[] {
  if (!model) return [];
  const tuxi = model.tuxiIntent;
  if (tuxi) return model.tuxiActive ? [] : [tuxi, ...(model.normalDrawChoice ? [model.normalDrawChoice] : [])];
  const ganglieDiscard = model.ganglieDiscardIntent;
  if (ganglieDiscard) return model.ganglieDiscardActive ? [] :
    [ganglieDiscard, ...(model.ganglieDamageChoice ? [model.ganglieDamageChoice] : [])];
  const all = model.scoped;
  const exact = model.exact.filter(choice =>
    !['endPlay', 'pass', 'cancel', 'confirm'].includes(choice.actionType ?? ''));
  const intent = Boolean(model.cards.length || model.targets.length || model.focus);
  const contextual = all.filter(choice => !choice.cardIds.length && !choice.targetIds.length &&
    !choice.zone && !['endPlay', 'pass', 'cancel', 'confirm'].includes(choice.actionType ?? '') &&
    (model.decision.kind !== 'play' || model.focus));
  const recasts = intent ? exact.filter(choice => choice.actionType === 'recast') : [];
  const ambiguous = intent && exact.length > 1 ? exact : recasts;
  return [...new Map([...contextual, ...ambiguous].map(choice => [choice.id, choice])).values()];
}
export interface SkillTile {
  id: string; label: string; detail: string; seal: string; help: string;
  passive: boolean; active: boolean; selected: boolean; choose(): void;
}
export class TableHud {
  constructor() { node('hud').classList.remove('hidden'); }
  render(obs: Observation, model: TableInteraction | null, busy: boolean, skills: SkillTile[],
    submit: (choice: ActionChoice) => void, submitBatch: (choices: ActionChoice[]) => void,
    clear: () => void, scope: (choice: ActionChoice) => void): void {
    node('turn').textContent = `第 ${obs.turn} 回合`;
    node('phase').textContent = `${PHASES[obs.phase] ?? obs.phase}阶段`;
    node('pile').textContent = `牌堆 ${obs.deckCount}　弃牌 ${obs.discardCount}`;
    node('log').replaceChildren(...obs.log.slice(-16).reverse().map(line => {
      const p = document.createElement('p'); p.textContent = line; return p;
    }));
    const ready = Boolean(model && !busy && obs.outcome.status === 'ongoing');
    const ganglieIntent = model?.ganglieDiscardIntent;
    const ganglieDiscarding = model?.ganglieDiscardActive ?? false;
    const tuxiIntent = model?.tuxiIntent;
    const tuxiSelecting = model?.tuxiActive ?? false;
    const qilinSelecting = model?.decision.kind === 'qilin';
    const guanshiSelecting = model?.decision.kind === 'guanshi';
    let prompt = busy || !model ? '对手正在行动…' : model.decision.title;
    if (ready && model) {
      if (model.decision.kind === 'fireAttackReveal') prompt = '火攻：点选一张手牌并确认展示';
      else if (model.decision.kind === 'fireAttackPay') prompt = '火攻：选择同花色手牌弃置，或放弃';
      else if (tuxiSelecting) prompt = `突袭：点选一至两名有手牌的其他角色（已选 ${model.targets.length}/2）`;
      else if (tuxiIntent) prompt = '摸牌阶段：发动突袭，或正常摸两张牌';
      else if (ganglieDiscarding) prompt = `刚烈：选择两张手牌（已选 ${model.cards.length}/2）`;
      else if (qilinSelecting) prompt = '麒麟弓：点击下方坐骑牌弃置，或选择不发动';
      else if (guanshiSelecting) prompt = `贯石斧：选择手牌或桌面装备弃置（已选 ${model.cards.length}/2）`;
      else if (model.unorderedTargets && model.targetLimit > 1 && model.cards.length)
        prompt = `选择至多 ${model.targetLimit} 个目标（已选 ${model.targets.length}/${model.targetLimit}） · 可确认当前目标`;
      else if (model.nextTargets.length && (model.cards.length || model.focus || model.decision.kind === 'skillTarget'))
        prompt = model.targets.length ? `选择第 ${model.targets.length + 1} 个目标，或确认当前目标` : '拖至亮起的武将 · 选择目标';
      else if (model.decision.kind === 'discard' && model.batchDiscard.length)
        prompt = `已选 ${model.cards.length} 张手牌 · 点击弃牌确认`;
      else if (model.cards.length) prompt = model.exact.length ? '松开到牌桌中央使用 · 或点击确认' : '继续选择需要的卡牌';
      else if (model.focus) prompt = `${model.focus.label} · 选择亮起的手牌或目标`;
      else if (model.decision.kind === 'play') prompt = '轮到你了 · 拖动手牌出牌';
    }
    if (obs.outcome.status !== 'ongoing') prompt = obs.outcome.status === 'draw' ? '本局平局' : obs.outcome.winners.includes(obs.self.id) ? '胜 利' : '本局落败';
    node('prompt').textContent = prompt;
    node('prompt').classList.toggle('waiting', !ready && obs.outcome.status === 'ongoing');
    const all = model?.scoped ?? [];
    const finish = all.find(c => c.actionType === 'endPlay');
    const pass = all.find(c => c.actionType === 'pass' || c.actionType === 'cancel');
    const confirm = all.find(c => c.actionType === 'confirm');
    const exact = (model?.exact ?? []).filter(c => !['endPlay', 'pass', 'cancel', 'confirm'].includes(c.actionType ?? ''));
    const intent = Boolean(model?.cards.length || model?.targets.length || model?.focus);
    const batch = model?.batchDiscard ?? [];
    const primary = confirm ?? (intent && exact.length === 1 ? exact[0] : undefined);
    node('action-bar').classList.toggle('hidden', Boolean(ganglieIntent && !ganglieDiscarding || tuxiIntent && !tuxiSelecting));
    const play = node('play-action') as HTMLButtonElement;
    play.textContent = tuxiSelecting ? '确认发动' : ganglieDiscarding || guanshiSelecting ? '确认弃牌' : confirm ? '确认所选' : model?.decision.kind === 'discard' ? '弃 牌' : model?.decision.kind === 'play' ? '出 牌' : '确 认';
    play.disabled = !ready || (model?.decision.kind === 'discard' ? !batch.length : !primary);
    play.onclick = () => { if (model?.decision.kind === 'discard') submitBatch(batch); else if (primary) submit(primary); };
    const end = node('end-action') as HTMLButtonElement;
    end.classList.toggle('hidden', Boolean(ganglieIntent || tuxiIntent));
    end.textContent = model?.decision.kind === 'fireAttackPay' ? '放弃火攻' : finish ? '结束出牌' : qilinSelecting || guanshiSelecting ? '不发动' : pass?.actionType === 'cancel' ? '取消发动' : '不响应';
    end.disabled = !ready || !(finish ?? pass); end.onclick = () => { const c = finish ?? pass; if (c) submit(c); };
    const cancel = node('cancel-action') as HTMLButtonElement;
    cancel.textContent = ganglieDiscarding || tuxiSelecting ? '返回选择' : '撤销选择';
    cancel.disabled = !ready || !intent; cancel.onclick = clear;
    const actions = contextActionChoices(model).map(choice => button(choice.label,
      () => choice.id === 'ui:ganglie-discard' || choice.id === 'ui:standard.tuxi' ? scope(choice) : submit(choice),
      !ready || (choice.id === 'ui:ganglie-discard' && !choice.children.length)));
    node('context-actions').replaceChildren(...actions);
    node('skill-actions').replaceChildren(...skills.map(skill => {
      const b = button('', skill.choose, !ready || !skill.active);
      b.className = 'skill-plaque'; b.dataset.skill = skill.id;
      b.title = `${skill.label} · ${skill.seal}\n${skill.detail}${skill.help ? `\n${skill.help}` : ''}`;
      b.setAttribute('aria-label', `${skill.label}，${skill.seal}，${skill.detail}`);
      b.setAttribute('aria-pressed', String(skill.selected));
      const seal = document.createElement('span'); seal.className = 'skill-seal'; seal.textContent = skill.seal;
      const title = document.createElement('strong'); title.textContent = skill.label;
      const detail = document.createElement('span'); detail.className = 'skill-detail'; detail.textContent = skill.detail;
      b.append(seal, title, detail);
      b.classList.toggle('passive', skill.passive);
      b.classList.toggle('available', ready && skill.active);
      b.classList.toggle('selected', skill.selected); return b;
    }));
    node('hand-count').textContent = `手牌 ${obs.self.handCount}`;
    node('drag-hint').textContent = obs.outcome.status !== 'ongoing' ? obs.outcome.reason :
      qilinSelecting ? '点击桌面上的坐骑原牌，即可确认弃置' :
      guanshiSelecting ? '手牌与桌面装备可以混选 · 选满两张后确认弃牌 · 再点已选牌取消' :
      tuxiSelecting ? '点选角色后确认发动 · 再点已选角色取消 · 返回选择可正常摸牌' :
      tuxiIntent ? '发动突袭后选择目标，或选择正常摸牌' :
      ganglieDiscarding ? '点选两张手牌，确认弃置 · 点击已选牌取消' :
      model?.decision.kind === 'discard' ? `点选 ${String((model.decision.context as { required?: number }).required ?? 1)} 张手牌后一次弃置　·　点击已选牌取消` :
      '拖牌至目标 / 中央出牌　·　点击可多选　·　右键 / Esc 撤销';
  }
  flashSkill(id: string): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tile = [...node('skill-actions').querySelectorAll<HTMLButtonElement>('[data-skill]')]
      .find(button => button.dataset.skill === id);
    tile?.animate([
      { filter: 'brightness(1)', boxShadow: 'inset 0 0 0 1px #b7995c40' },
      { filter: 'brightness(1.55)', boxShadow: 'inset 0 0 18px #eac88680, 0 0 12px #dfad5350', offset: 0.25 },
      { filter: 'brightness(1)', boxShadow: 'inset 0 0 0 1px #b7995c40' },
    ], { duration: 620, easing: 'ease-out' });
  }
  preview(url?: string, label = '', details: readonly { title: string; body: string }[] = []) {
    const box = node('inspector'); box.classList.toggle('hidden', !url);
    if (!url) return;
    const img = document.createElement('img'); img.src = url; img.alt = label;
    const caption = document.createElement('strong'); caption.textContent = label;
    box.replaceChildren(img, caption, ...details.map(detail => {
      const section = document.createElement('section');
      const title = document.createElement('b'); title.textContent = detail.title;
      const body = document.createElement('p'); body.textContent = detail.body;
      section.append(title, body);
      return section;
    }));
  }
}
