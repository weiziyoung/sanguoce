import type { Observation } from '../../contracts.ts';
import type { ActionChoice } from '../presentation/choice-view.ts';
import type { TableInteraction } from './interaction-model.ts';
import { huashenCards } from './huashen-view.ts';
import { qiaobianPresentation } from './qiaobian-interaction.ts';

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
    !['endPlay', 'pass', 'cancel', 'confirm', 'ignoreNullify'].includes(choice.actionType ?? ''));
  const intent = Boolean(model.cards.length || model.targets.length || model.focus);
  const contextual = all.filter(choice => !choice.cardIds.length && !choice.targetIds.length &&
    !choice.zone && !['endPlay', 'pass', 'cancel', 'confirm', 'ignoreNullify'].includes(choice.actionType ?? '') &&
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
  private avatarSignature = '';
  private inspectedSkill?: string;
  private generalImages: Readonly<Record<string, string>>;
  constructor(generalImages: Readonly<Record<string, string>> = {}) {
    this.generalImages = generalImages;
    node('hud').classList.remove('hidden');
    this.hideSkillHelp();
  }
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
    const jixiSelecting = model?.focus?.ability === 'mountain.jixi' || model?.focus?.id === 'ui:mountain.jixi';
    const dimengSelecting = model?.decision.kind === 'skillTarget' &&
      (model.decision.context as { ability?: string } | undefined)?.ability === 'forest.dimeng';
    const content = model?.decision.kind === 'contentChoice' ? model.decision.context as { ability: string; timing: string; amount?: number; selectedIds?: number[] } : undefined;
    const guzhengSelecting = content?.ability === 'mountain.guzheng';
    const qiaobian = qiaobianPresentation(obs, model);
    if (qiaobian) node('phase').textContent = qiaobian.phase;
    let prompt = busy || !model ? '对手正在行动…' : model.decision.title;
    if (ready && model) {
      if (qiaobian) prompt = qiaobian.prompt;
      else if (jixiSelecting) prompt = !model.cards.length ? '急袭：先选择中央的一张田，再选择其他角色' :
        !model.targets.length ? '急袭：选择亮起的其他角色作为顺手牵羊的目标' : '急袭：确认使用，随后选择目标的一张牌获得';
      else if (dimengSelecting) prompt = `缔盟：选择两名其他角色交换手牌（已选 ${model.targets.length}/2）`;
      else if (guzhengSelecting) prompt = `固政：选择一张弃牌归还，确认后获得其余弃牌（已选 ${model.cards.length}/1）`;
      else if (content?.ability === 'forest.haoshi') prompt = content.timing === 'cards' ? `好施：选择赠出一半手牌（已选 ${content.selectedIds?.length ?? 0}/${content.amount}）` : '好施：点击手牌最少的接收者，再确认';
      else if (content?.ability === 'forest.yinghun' && content.timing === 'discard') prompt = `英魂：选择自己的手牌或装备弃置（还需 ${content.amount} 张）`;
      else if (content?.ability === 'forest.luanwu') prompt = '乱武：选择手牌中的杀与最近目标，或选择失去体力';
      else if (content?.ability === 'wind.tianxiang') prompt = `天香：选择红桃或黑桃手牌，再选择伤害接收者（${content.amount ?? 1}点伤害）`;
      else if (content?.ability === 'wind.leiji') prompt = '雷击：点击亮起的武将，再确认判定目标';
      else if (content?.ability === 'wind.shensu') prompt = content.timing === 'judge' ? '神速：选择杀的目标，跳过判定与摸牌' : '神速：选择手牌或桌面装备，再选择杀的目标';
      else if (content?.ability === 'wind.buqu' && content.timing === 'remove') prompt = '不屈：选择中央亮出的不屈牌，再确认移去';
      else if (model.decision.kind === 'pindian') prompt = '拼点：点选一张手牌并确认 · 双方选定后同时公开';
      else if (model.decision.kind === 'fireAttackReveal') prompt = '火攻：点选一张手牌并确认展示';
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
    const exact = (model?.exact ?? []).filter(c => !['endPlay', 'pass', 'cancel', 'confirm', 'ignoreNullify'].includes(c.actionType ?? ''));
    const intent = Boolean(model?.cards.length || model?.targets.length || model?.focus);
    const batch = model?.batchDiscard ?? [];
    const primary = confirm ?? (intent && exact.length === 1 ? exact[0] : undefined);
    node('action-bar').classList.toggle('hidden', Boolean(ganglieIntent && !ganglieDiscarding || tuxiIntent && !tuxiSelecting));
    const play = node('play-action') as HTMLButtonElement;
    play.textContent = qiaobian ? qiaobian.primary : guzhengSelecting ? '确认归还' : tuxiSelecting ? '确认发动' : ganglieDiscarding || guanshiSelecting ? '确认弃牌' : confirm ? '确认所选' : model?.decision.kind === 'discard' ? '弃 牌' : model?.decision.kind === 'play' ? '出 牌' : '确 认';
    play.disabled = !ready || (model?.decision.kind === 'discard' ? !batch.length : !primary);
    play.onclick = () => { if (model?.decision.kind === 'discard') submitBatch(batch); else if (primary) submit(primary); };
    const end = node('end-action') as HTMLButtonElement;
    end.classList.toggle('hidden', Boolean(ganglieIntent || tuxiIntent));
    end.textContent = qiaobian ? qiaobian.pass : guzhengSelecting ? '不发动固政' : model?.decision.kind === 'fireAttackPay' ? '放弃火攻' : finish ? '结束出牌' : qilinSelecting || guanshiSelecting || content ? '不发动' : pass?.actionType === 'cancel' ? '取消发动' : '不响应';
    end.disabled = !ready || !(finish ?? pass); end.onclick = () => { const c = finish ?? pass; if (c) submit(c); };
    const ignoreChoice = model?.decision.kind === 'nullify' ? model.leaves.find(c => c.actionType === 'ignoreNullify') : undefined;
    const ignore = node('ignore-nullify') as HTMLButtonElement;
    ignore.classList.toggle('hidden', !ignoreChoice);
    ignore.disabled = !ready || !ignoreChoice;
    ignore.onclick = () => { if (ignoreChoice && ready) submit(ignoreChoice); };
    const cancel = node('cancel-action') as HTMLButtonElement;
    cancel.textContent = ganglieDiscarding || tuxiSelecting ? '返回选择' : '撤销选择';
    cancel.disabled = !ready || !intent; cancel.onclick = clear;
    const actions = contextActionChoices(model).map(choice => button(choice.label,
      () => choice.id === 'ui:ganglie-discard' || choice.id === 'ui:standard.tuxi' ? scope(choice) : submit(choice),
      !ready || (choice.id === 'ui:ganglie-discard' && !choice.children.length)));
    node('context-actions').replaceChildren(...actions);
    node('skill-actions').replaceChildren(...skills.map(skill => {
      const wrapper = document.createElement('div'); wrapper.className = 'skill-tile';
      const b = button('', skill.choose, !ready || !skill.active);
      b.className = 'skill-plaque'; b.dataset.skill = skill.id;
      b.setAttribute('aria-label', `${skill.label}，${skill.seal}，${skill.detail}`);
      b.setAttribute('aria-pressed', String(skill.selected));
      b.setAttribute('aria-describedby', 'skill-tooltip');
      // Disabled buttons do not reliably receive hover events. Their wrapper remains inspectable.
      wrapper.tabIndex = b.disabled ? 0 : -1;
      wrapper.setAttribute('aria-label', `${skill.label}，${skill.seal}，${skill.detail}`);
      wrapper.setAttribute('aria-describedby', 'skill-tooltip');
      const show = () => this.showSkillHelp(skill);
      const hide = () => this.hideSkillHelp();
      wrapper.onpointerenter = show; wrapper.onpointerleave = hide;
      wrapper.onfocus = show; wrapper.onblur = hide;
      b.onfocus = show; b.onblur = hide;
      const seal = document.createElement('span'); seal.className = 'skill-seal'; seal.textContent = skill.seal;
      const title = document.createElement('strong'); title.textContent = skill.label;
      const detail = document.createElement('span'); detail.className = 'skill-detail'; detail.textContent = skill.detail;
      b.append(seal, title, detail);
      b.classList.toggle('passive', skill.passive);
      b.classList.toggle('available', ready && skill.active);
      b.classList.toggle('selected', skill.selected); wrapper.append(b); return wrapper;
    }));
    if (this.inspectedSkill) {
      const skill = skills.find(skill => skill.id === this.inspectedSkill);
      if (skill) this.showSkillHelp(skill); else this.hideSkillHelp();
    }
    this.renderAvatars(obs);
    node('hand-count').textContent = `手牌 ${obs.self.handCount}`;
    node('drag-hint').textContent = obs.outcome.status !== 'ongoing' ? obs.outcome.reason :
      qiaobian ? qiaobian.hint :
      jixiSelecting ? '点击中央田牌，再点选目标并确认 · 再点田牌取消 · 右键 / Esc 撤销' :
      dimengSelecting ? '两名目标可任意顺序点选 · 再点已选角色取消 · 确认后交换手牌' :
      guzhengSelecting ? '点击一张弃牌归还 · 确认后收取其余弃牌 · 右键 / Esc 撤销' :
      model?.decision.kind === 'nullify' ? '不响应：跳过当前询问 · 本次忽略无懈：跳过这张牌的全部后续询问，下一张牌恢复' :
      qilinSelecting ? '点击桌面上的坐骑原牌，即可确认弃置' :
      guanshiSelecting ? '手牌与桌面装备可以混选 · 选满两张后确认弃牌 · 再点已选牌取消' :
      tuxiSelecting ? '点选角色后确认发动 · 再点已选角色取消 · 返回选择可正常摸牌' :
      tuxiIntent ? '发动突袭后选择目标，或选择正常摸牌' :
      ganglieDiscarding ? '点选两张手牌，确认弃置 · 点击已选牌取消' :
      model?.decision.kind === 'discard' ? `点选 ${String((model.decision.context as { required?: number }).required ?? 1)} 张手牌后一次弃置　·　点击已选牌取消` :
      '拖牌至目标 / 中央出牌　·　点击可多选　·　右键 / Esc 撤销';
  }
  private showSkillHelp(skill: SkillTile): void {
    this.inspectedSkill = skill.id;
    const box = node('skill-tooltip');
    box.textContent = `${skill.label} · ${skill.seal}\n${skill.help}\n${skill.detail}`;
    box.classList.remove('hidden');
  }
  private hideSkillHelp(): void {
    this.inspectedSkill = undefined;
    node('skill-tooltip').classList.toggle('hidden', true);
  }
  private renderAvatars(obs: Observation): void {
    const signature = JSON.stringify([obs.self.huashen, obs.self.generalSkillsDisabled]);
    if (signature === this.avatarSignature) return;
    this.avatarSignature = signature;
    const cards = huashenCards(obs), box = node('huashen-panel');
    box.classList.toggle('hidden', !cards.length);
    const title = document.createElement('strong'); title.className = 'huashen-heading';
    title.textContent = `化身牌（${cards.length}）`;
    const hint = document.createElement('p'); hint.className = 'huashen-hint';
    hint.textContent = obs.self.generalSkillsDisabled ? '断肠 · 化身技能已失效' : '仅自己可见 · 准备 / 结束阶段可更换';
    const list = document.createElement('div'); list.className = 'huashen-list';
    list.append(...cards.map(card => {
      const entry = document.createElement('details'); entry.className = 'huashen-card';
      entry.classList.toggle('current', card.selected);
      const summary = document.createElement('summary');
      const url = this.generalImages[card.id];
      if (url) { const image = document.createElement('img'); image.src = url; image.alt = card.label; summary.append(image); }
      const caption = document.createElement('span');
      const name = document.createElement('b'); name.textContent = `${card.label}${card.selected ? ' · 当前' : ''}`;
      const skills = document.createElement('small');
      skills.textContent = card.skills.map(skill => `${skill.label}${skill.selected ? '（已获得）' : ''}`).join(' / ');
      caption.append(name, skills); summary.append(caption); entry.append(summary);
      for (const skill of card.skills) {
        const help = document.createElement('p'); help.textContent = `${skill.label}：${skill.help}`; entry.append(help);
      }
      return entry;
    }));
    box.replaceChildren(title, hint, list);
  }
  dispose(): void {
    this.hideSkillHelp();
    node('huashen-panel').classList.toggle('hidden', true);
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
