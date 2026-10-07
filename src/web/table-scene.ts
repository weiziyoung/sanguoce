import Phaser from 'phaser';
import { NAMES, type Card } from '../../catalog.ts';
import type { Observation, VisiblePlayer } from '../../contracts.ts';
import type { BrowserSession } from '../app/browser-session.ts';
import { expandedContent } from '../app/game-content.ts';
import { STANDARD_SKILL_HELP } from '../content/standard/skill-help.ts';
import { EQUIPMENT_HELP } from '../presentation/equipment-help.ts';
import type { ActionChoice } from '../presentation/choice-view.ts';
import { TableInteraction } from './interaction-model.ts';
import { TableAssets } from './assets.ts';
import type { GameAudio } from './audio.ts';
import { TableHud, node, type SkillTile } from './hud.ts';
import { TableEffects } from './effects.ts';
import { HAND, PLAY_AREA, IDENTITY_SELF, EQUIPMENT_ROW, IDENTITY_JUDGE, equipmentRowPosition, deckPosition, handPosition, handCardPosition, hiddenHandSlot, playerPosition, identityZonePosition, inside, type Point } from './layout.ts';
import { background, panel, portraitArt, cardView, cardBack, equipmentIcon, text, COLORS } from './visuals.ts';
import { zoneCardEffect } from './zone-card-effect.ts';
import { discardTableCard } from './discard-table-card.ts';
import { roleLabel } from '../../chinese-view.ts';
import { showSettlement } from './settlement.ts';
import { zonePickerChoices, type ZonePick } from './zone-picker.ts';
import { PlayerVitalsPresenter, type PlayerVitalsState } from './player-vitals.ts';
import { HEALTH_PIP_STATES, healthPips, healthPipTexture, healthPipSourceTexture, healthPipLayout } from './health-pips.ts';
import { bindSceneSettings, type GameSettings } from './settings.ts';
import { unavailableSkillDetail } from './skill-availability.ts';
import { factionBanner, identityToken } from './portrait-badges.ts';
import { portraitChain, portraitChainUpdate } from './portrait-chain.ts';
import { AiController } from './ai-controller.ts';

interface CardSprite { card: Card; view: Phaser.GameObjects.Container; border: Phaser.GameObjects.Rectangle; home: Point; order: number; }
const REORDER = { top: { x: 1175, y: 442, width: 180, height: 85 }, bottom: { x: 1175, y: 548, width: 180, height: 85 } };

export class TableScene extends Phaser.Scene {
  private hud!: TableHud;
  private effects!: TableEffects;
  private model: TableInteraction | null = null;
  private busy = true;
  private lastEvent = 0;
  private endAnnounced = false;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private cards: CardSprite[] = [];
  private tablePreviewCards: CardSprite[] = [];
  private hiddenBacks = new Map<number, Phaser.GameObjects.Container>();
  private chainViews = new Map<number, Phaser.GameObjects.Graphics>();
  private vitalsViews = new Map<number, { label: Phaser.GameObjects.Text;
    pips: Phaser.GameObjects.Image[]; death: Phaser.GameObjects.Text }>();
  private vitals = new PlayerVitalsPresenter((id, state) => this.renderVitals(id, state));
  private pendingHandOrigin: Point | null = null;
  private highlights!: Phaser.GameObjects.Graphics;
  private arrow!: Phaser.GameObjects.Graphics;
  private dragging = false;
  private dragAllowed = false;
  private roleNotes = new Map<number, '?' | 'loyalist' | 'rebel' | 'renegade'>();
  private ai!: AiController;
  private aiPaused = false;
  private disposed = false;
  constructor(private session: BrowserSession, private assets: TableAssets, private audio: GameAudio,
    private settings: GameSettings) { super('table'); }
  preload() {
    const back = this.assets.manifest.cardBack;
    if (back && !this.textures.exists('card-back')) this.load.image('card-back', back);
    for (const state of HEALTH_PIP_STATES) {
      const url = this.assets.manifest.healthPips?.[state];
      if (url && !this.textures.exists(healthPipSourceTexture(state))) this.load.image(healthPipSourceTexture(state), url);
    }
  }
  create() {
    this.disposed = false;
    this.ai = new AiController(this.settings);
    const retry = () => { if (!this.busy && !this.disposed) void this.run(); };
    node('ai-retry').onclick = retry;
    node('ai-configure').onclick = () => node('settings').click();
    let settingsWereOpen = this.settings.open;
    const unsubscribe = this.settings.subscribe(() => {
      const closed = settingsWereOpen && !this.settings.open;
      settingsWereOpen = this.settings.open;
      if (closed && !this.busy && !this.session.finished && this.session.decision?.actor !== this.session.humanSeat) retry();
    });
    this.assets.prepareHealthPips(this);
    this.roleNotes.clear();
    background(this);
    this.hud = new TableHud();
    this.effects = new TableEffects(this, this.assets, this.audio);
    this.highlights = this.add.graphics().setDepth(100);
    this.arrow = this.add.graphics().setDepth(950);
    this.input.dragDistanceThreshold = 9;
    this.input.mouse?.disableContextMenu();
    this.input.keyboard?.on('keydown-ESC', () => this.clear());
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => { if (pointer.rightButtonDown()) this.clear(); });
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, view: Phaser.GameObjects.Container) => this.dragStart(view));
    this.input.on('drag', (p: Phaser.Input.Pointer, view: Phaser.GameObjects.Container, x: number, y: number) => this.drag(p, view, x, y));
    this.input.on('dragend', (p: Phaser.Input.Pointer, view: Phaser.GameObjects.Container) => this.dragEnd(p, view));
    this.events.once('shutdown', () => {
      this.disposed = true; this.ai.dispose(); unsubscribe();
      node('ai-retry').onclick = null; node('ai-configure').onclick = null;
      this.effects.dispose(); this.hud.preview();
    });
    this.lastEvent = Math.max(0, ...this.session.observation.events.map(e => e.id));
    bindSceneSettings(this, this.settings);
    void this.run();
  }
  private track<T extends Phaser.GameObjects.GameObject>(object: T): T { this.objects.push(object); return object; }
  private position(id: number): Point {
    const obs = this.session.observation;
    return playerPosition(id, [obs.self, ...obs.others].map(p => p.id), obs.self.id);
  }
  private get ready(): boolean { return !this.settings.open && !this.busy && Boolean(this.model) && !this.dragging; }
  private clear() { if (!this.ready) return; this.model?.clear(); this.updateSelection(); }
  private skills(): SkillTile[] {
    const general = this.session.observation.self.general;
    if (!general) return [];
    const definitions = expandedContent.general(general).abilities.map(id => expandedContent.requireSkill(id));
    // Equipment conversions use the same legal-action projection as general skills.
    const abilityIds = [...new Set(this.model?.leaves.map(c => c.ability).filter((id): id is string => Boolean(id)))];
    for (const id of abilityIds) {
      const definition = expandedContent.skills().find(s => s.id === id || s.transformations?.some(t => t.id === id));
      if (definition && !definitions.includes(definition)) definitions.push(definition);
    }
    return definitions.map(skill => {
      const matches = this.model?.leaves.filter(c => c.ability === skill.id || skill.transformations?.some(t => t.id === c.ability)) ?? [];
      const context = this.model?.decision.context as { ability?: string } | undefined;
      const resolving = context?.ability === skill.id;
      const selected = resolving || Boolean(this.model?.focus && matches.some(c => c.id === this.model?.focus?.id || this.model?.focus?.children.some(child => child.id === c.id)));
      const automatic = skill.drawPhase?.optional === false || skill.trigger?.optional === false;
      const conversion = Boolean(skill.transformation || skill.transformations);
      return { id: skill.id, label: skill.label ?? skill.id, active: matches.length > 0, selected,
        seal: skill.lordSkill ? '主公' : skill.active ? '主动' : conversion ? '转化' : automatic ? '自动' : skill.modifier ? '常驻' : '触发',
        passive: !skill.active && !conversion,
        help: STANDARD_SKILL_HELP[skill.id] ?? EQUIPMENT_HELP[skill.id.replace(/^(standard|junzheng)\./, '')] ?? '',
        detail: resolving ? '正在结算 · 按提示操作' : skill.lordSkill && this.session.mode === 'duel' ? '主公技 · 本局不可用' : matches.length ? selected ? skill.id === 'standard.tuxi' ? '选择目标 · 确认发动' : '已发动 · 选择牌 / 目标' : '点击发动' : skill.active || conversion ? unavailableSkillDetail(skill.id, this.session.observation) : automatic ? '自动触发' : skill.modifier ? '常驻生效' : '等待触发时机',
        choose: () => {
          if (!this.ready || !matches.length) return;
          if (selected) { this.clear(); return; }
          if (matches.length === 1 && !matches[0].cardIds.length && !matches[0].targetIds.length) { void this.submit(matches[0]); return; }
          this.model!.scope({ id: `ui:${skill.id}`, label: skill.label ?? skill.id, cardIds: [], targetIds: [], children: matches });
          this.updateSelection();
        } };
    });
  }
  private renderHud() {
    this.hud.render(this.session.observation, this.model, this.busy, this.skills(),
      c => { void this.submit(c); }, choices => { void this.run(choices); }, () => this.clear(),
      choice => { this.model?.scope(choice); this.updateSelection(); });
    if (this.aiPaused && !this.busy) node('prompt').textContent = 'AI 决策暂停 · 请重试或修改设置';
  }
  private async refresh() {
    const obs = this.session.observation;
    await this.assets.ensure(this, obs);
    await this.settings.whenClosed();
    const events = obs.events.filter(e => e.id > this.lastEvent);
    this.lastEvent = Math.max(this.lastEvent, ...events.map(e => e.id));
    // The previous static preview must not remain beneath a new animated card.
    if (events.length) for (const card of this.tablePreviewCards) card.view.setVisible(false);
    for (const event of events) {
      await this.settings.whenClosed();
      const chain = portraitChainUpdate(event);
      if (chain) this.chainViews.get(chain.player)?.setVisible(chain.visible);
      if (event.kind === 'skillActivated' && event.data.owner === obs.self.id) this.hud.flashSkill(event.data.ability);
      const transfer = zoneCardEffect(event, obs);
      const discarded = discardTableCard(event, obs);
      let origin: Point | undefined;
      if (discarded) {
        const sprite = this.cards.find(item => item.card.id === discarded.card.id);
        if (sprite) { origin = { x: sprite.view.x, y: sprite.view.y }; sprite.view.setVisible(false); }
      }
      if (event.kind === 'judged' || event.kind === 'harvestTaken') {
        const preview = this.tablePreviewCards.find(item => item.card.id === event.data.card);
        if (preview) origin = { x: preview.view.x, y: preview.view.y };
      }
      if (transfer) {
        if (transfer.selection.fromZone === 'hand' && this.pendingHandOrigin) origin = this.pendingHandOrigin;
        else if (transfer.cardId !== null) {
          const sprite = this.cards.find(item => item.card.id === transfer.cardId);
          if (sprite) {
            origin = { x: sprite.view.x, y: sprite.view.y };
            sprite.view.setVisible(false);
          }
        }
      }
      if ((event.kind === 'drawn' || event.kind === 'harvestTaken') && event.data.player === obs.self.id ||
        transfer?.kind === 'gain' && transfer.to === obs.self.id) this.reflowHand(obs);
      await this.vitals.play(event, () => this.effects.play(event, obs, origin));
    }
    await this.settings.whenClosed();
    this.pendingHandOrigin = null;
    const decision = this.session.decision;
    this.model = decision?.actor === obs.self.id ? new TableInteraction(decision, obs.self.hand) : null;
    this.redraw(obs);
    this.renderHud();
    if (!this.endAnnounced && obs.outcome.status !== 'ongoing') {
      this.endAnnounced = true;
      this.audio.finish(this.assets.manifest.systemAudio.game_end);
      document.getElementById('outside-mute')?.classList.remove('hidden');
      document.getElementById('outside-settings')?.classList.remove('hidden');
      showSettlement(obs, this.session.mode, this.session.gameDocument());
    }
  }
  private async run(choice?: ActionChoice | ActionChoice[]) {
    if (choice && (!this.ready || !this.model)) return;
    const decisionId = this.model?.decision.id;
    this.aiPaused = false;
    node('error').textContent = '';
    node('ai-recovery').classList.add('hidden');
    this.busy = true; this.highlights.clear(); this.arrow.clear(); this.hud.preview(); this.renderHud();
    try {
      if (Array.isArray(choice)) {
        const selected = this.model?.batchDiscard ?? [];
        if (!selected.length || selected.length !== choice.length ||
          !choice.every(item => selected.some(candidate => candidate.id === item.id))) throw new Error('弃牌选择已失效');
        for (const item of choice) {
          const current = this.session.decision;
          if (current?.kind !== 'discard') throw new Error('弃牌阶段已结束');
          const option = current.options.find(option => {
            const data = option.data as { type?: string; cid?: number } | undefined;
            return data?.type === 'discard' && data.cid === item.cardIds[0];
          });
          if (!option) throw new Error('所选弃牌已失效');
          this.session.choose(option.id, current.id!);
        }
        for (const sprite of this.cards) if (choice.some(item => item.cardIds.includes(sprite.card.id))) sprite.view.setVisible(false);
      } else if (choice) {
        this.session.choose(choice.id, decisionId!);
        for (const sprite of this.cards) if (choice.cardIds.includes(sprite.card.id)) sprite.view.setVisible(false);
        if (choice.zone === 'hand' && choice.slot !== undefined) {
          const back = this.hiddenBacks.get(choice.slot);
          if (back) {
            this.pendingHandOrigin = { x: back.x, y: back.y };
            back.setVisible(false);
          }
        }
      }
      await this.refresh();
      while (!this.session.finished && this.session.decision?.actor !== this.session.humanSeat) {
        const decision = this.session.decision!;
        const fivePlayer = this.session.mode === 'identity';
        const delay = fivePlayer ? decision.kind === 'play' || decision.kind === 'skillTarget' ? 850 : 530 : 360;
        await new Promise(resolve => this.time.delayedCall(delay, resolve));
        await this.settings.whenClosed();
        await this.ai.step(this.session, label => { node('prompt').textContent = label; });
        if (this.disposed) return;
        await this.refresh();
      }
    } catch (error) {
      if (this.disposed) return;
      console.error(error);
      node('error').textContent = error instanceof Error ? error.message : String(error);
      this.aiPaused = !this.session.finished && this.session.decision?.actor !== this.session.humanSeat;
      node('ai-recovery').classList.toggle('hidden', !this.aiPaused);
    } finally { this.pendingHandOrigin = null; this.busy = false; if (!this.disposed) this.updateSelection(); }
  }
  private submit(choice: ActionChoice) { return this.run(choice); }
  private reflowHand(obs: Observation): void {
    for (const sprite of this.cards) {
      if (sprite.home.y !== HAND.y) continue;
      const index = obs.self.hand.findIndex(card => card.id === sprite.card.id);
      if (index < 0) continue;
      this.tweens.killTweensOf(sprite.view);
      this.tweens.add({ targets: sprite.view, ...handCardPosition(index, obs.self.hand.length),
        duration: 260, ease: 'Sine.InOut' });
    }
  }
  private redraw(obs: Observation) {
    this.effects.clearHandFlights();
    this.objects.forEach(o => o.destroy()); this.objects = []; this.cards = []; this.tablePreviewCards = []; this.hiddenBacks.clear();
    this.vitalsViews.clear();
    this.chainViews.clear();
    this.vitals.reset([obs.self, ...obs.others]);
    this.track(text(this, 795, 626, '牌 桌', 18, '#b6a787').setAlpha(0.7));
    const deck = deckPosition(obs.others.length + 1);
    this.track(cardBack(this, deck.x, deck.y, 63, 90));
    this.track(text(this, deck.x, deck.y + 67, `牌堆 ${obs.deckCount}`, 18));
    [obs.self, ...obs.others].forEach(p => this.portrait(p, obs));
    const picks = zonePickerChoices(obs, this.model);
    this.effects.setZonePickerActive(picks.length > 0);
    this.zonePicker(picks);
    const hand = obs.self.hand;
    hand.forEach((card, index) => {
      const position = handCardPosition(index, hand.length);
      this.makeCard(card, position.x, position.y, HAND.cardWidth, HAND.cardHeight, 20 + index);
    });
    const choosingZone = picks.length > 0;
    const table = (choosingZone || this.effects.hasActiveJudgementCard() ? [] :
      this.session.decision?.kind === 'judgeReplace' ? obs.table.slice(-1) : obs.table)
      .filter(card => !this.effects.hasTableCard(card.id));
    const relevant = table.filter(c => this.model?.selectableCards.includes(c.id));
    const shown = relevant.length ? relevant : table.slice(-3);
    const centerX = this.model?.decision.kind === 'deckReorder' ? 755 : 790;
    const spacing = Math.min(128, 570 / Math.max(1, shown.length));
    shown.forEach((card, index) => {
      const sprite = this.makeCard(card, centerX + (index - (shown.length - 1) / 2) * spacing, 483, 108, 154, 10 + index);
      this.tablePreviewCards.push(sprite);
      if (!relevant.length) sprite.view.setAlpha(0.66);
    });
    if (this.model?.decision.kind === 'deckReorder') for (const side of ['top', 'bottom'] as const) {
      const area = REORDER[side];
      this.track(panel(this, area.x, area.y, area.width, area.height));
      this.track(text(this, area.x, area.y, side === 'top' ? '拖至牌堆顶' : '拖至牌堆底', 22));
    }
    this.updateSelection();
  }
  private portrait(player: VisiblePlayer, obs: Observation) {
    const { x, y } = this.position(player.id);
    const self = player.id === obs.self.id;
    const identity = obs.mode.id === 'identity';
    const w = self && identity ? IDENTITY_SELF.width : self ? 196 : identity ? 172 : 204;
    const h = self && identity ? IDENTITY_SELF.height : self ? 242 : identity ? 214 : 260;
    this.track(this.add.rectangle(x, y, w, h, 0x0d1c19, 0.85));
    this.track(portraitArt(this, x + 10, y - 10, w - 36, h - 34, player.general ?? ''));
    this.track(this.add.rectangle(x - w / 2 + 19, y, 34, h - 12, 0x102422, 0.96));
    const nameX = x - w / 2 + 19;
    const name = this.track(text(this, nameX, y - h / 2 + 43, player.label.split('').join('\n'),
      player.label.length > 2 ? 22 : 24).setOrigin(0.5, 0).setLineSpacing(0));
    this.track(factionBanner(this, nameX, y - h / 2 + 13, player.group));
    this.track(this.add.rectangle(x + 16, y + h / 2 - 20, w - 47, 31, 0x091714, 0.94));
    const label = this.track(text(this, x + 16, y + h / 2 - 20, `${player.hp} / ${player.maxHp}`, 21));
    const pipLayout = healthPipLayout(name.y + name.height, y + h / 2, player.maxHp);
    const pips = healthPips(player).map((state, i) =>
      this.track(this.add.image(nameX, pipLayout[i].y, healthPipTexture(state))
        .setDisplaySize(pipLayout[i].size, pipLayout[i].size)));
    const death = this.track(text(this, x, y, '阵 亡', 40, '#c78c7b').setDepth(75).setVisible(!player.alive));
    this.vitalsViews.set(player.id, { label, pips, death });
    const chain = this.track(portraitChain(this, x, y, w, h).setDepth(6).setVisible(Boolean(player.alive && player.chained)));
    this.chainViews.set(player.id, chain);
    const status = [player.chained ? '连环' : '', player.drunk ? '酒＋1' : ''].filter(Boolean).join(' · ');
    if (status) this.track(text(this, x + 15, y - h / 2 + 48, status, 18, '#f3d394').setDepth(76));
    if (!self) {
      const pocket = handPosition(player.id, [obs.self, ...obs.others].map(p => p.id), obs.self.id);
      this.track(cardBack(this, pocket.x, pocket.y, 54, 76).setDepth(2));
      this.track(text(this, pocket.x, pocket.y + 55, `${player.handCount} 张`, 18));
      this.track(text(this, x, y - h / 2 - 24,
        obs.mode.id === 'identity' ? `座${player.id + 1} · ${roleLabel(player.role)}${obs.active === player.id ? ' · 行动中' : ''}` :
          obs.active === player.id ? '对手 · 行动中' : '对手', 18, '#c8b88e'));
    }
    if (self && identity) this.track(text(this, x, y - h / 2 + 23,
      `座${player.id + 1} · ${roleLabel(player.role)}`, 18, '#f3d394'));
    if (identity) {
      const markerX = x + w / 2 - 16, markerY = y - h / 2 + 17;
      const known = Boolean(player.role);
      const note = this.roleNotes.get(player.id) ?? '?';
      const token = identityToken(this, markerX, markerY, player.role, note);
      const marker = this.track(token.view.setDepth(70));
      if (!known) {
        marker.setInteractive({ useHandCursor: true });
        marker.on('pointerover', () => marker.setAlpha(0.85));
        marker.on('pointerout', () => marker.setAlpha(1));
        marker.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          if (!pointer.leftButtonReleased()) return;
          const options = ['?', 'loyalist', 'rebel', 'renegade'] as const;
          const next = options[(options.indexOf(this.roleNotes.get(player.id) ?? '?') + 1) % options.length];
          this.roleNotes.set(player.id, next);
          token.update(next);
        });
      }
    }
    const hit = this.track(this.add.rectangle(x, y, w, h, 0xffffff, 0).setDepth(1).setInteractive({ useHandCursor: true }));
    hit.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.leftButtonReleased() && this.ready && this.model?.selectTarget(player.id)) this.updateSelection(); });
    hit.on('pointerover', () => {
      if (this.dragging || this.model?.nextTargets.includes(player.id)) return;
      const abilities = player.general ? expandedContent.general(player.general).abilities : [];
      this.hud.preview(this.assets.manifest.generals[player.general ?? ''],
        `${player.label} · ${player.general ? expandedContent.general(player.general).label : '武将'}`,
        abilities.map(id => ({ title: expandedContent.requireSkill(id).label ?? id,
          body: STANDARD_SKILL_HELP[id] ?? '技能详情暂缺' })));
    });
    hit.on('pointerout', () => this.hud.preview());
    const equipment = Object.entries(player.equip).filter((entry): entry is [string, Card] => Boolean(entry[1]));
    const seats = [obs.self, ...obs.others].map(p => p.id);
    equipment.forEach(([slot, card], i) => {
      this.equipmentLabel(card, slot, equipmentRowPosition(player.id, seats, obs.self.id, i, equipment.length));
    });
    if (identity) {
      player.judge.forEach((card, i) => {
        const pos = identityZonePosition(player.id, seats, obs.self.id, 'judge', i, player.judge.length);
        this.makeCard(card, pos.x, pos.y, IDENTITY_JUDGE.width, IDENTITY_JUDGE.height, 8 + i);
      });
    } else {
      player.judge.forEach((card, i) => {
        const pos = self ? { x: 290 + i * 82, y: 603 } : { x: x - 190 - i * 79, y: y + 44 };
        this.makeCard(card, pos.x, pos.y, 69, 99, 8 + i);
        this.track(text(this, pos.x, pos.y + 65, '判定', 15));
      });
    }
  }
  private renderVitals(id: number, state: PlayerVitalsState): void {
    const view = this.vitalsViews.get(id);
    if (!view) return;
    view.label.setText(`${state.hp} / ${state.maxHp}`);
    const pips = healthPips(state);
    view.pips.forEach((pip, index) => pip.setTexture(healthPipTexture(pips[index] ?? 'empty')));
    view.death.setVisible(!state.alive);
  }
  private equipmentLabel(card: Card, slot: string, pos: Point & { width: number }): void {
    const prefix: Record<string, string> = { plusHorse: '+1', minusHorse: '-1' };
    const chip = this.track(this.add.container(pos.x, pos.y)
      .setSize(pos.width, EQUIPMENT_ROW.height).setDepth(9));
    const left = -pos.width / 2;
    const suit = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[card.suit];
    const red = card.suit === 'heart' || card.suit === 'diamond';
    const color = red ? '#ff9c91' : '#e3e5d7';
    const rank = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[card.rank] ?? String(card.rank);
    const label = text(this, pos.width / 2 - 2, 0, `${prefix[slot] ?? ''}${card.label ?? NAMES[card.name] ?? card.name}`, 13, '#f3e4bd')
      .setOrigin(1, 0.5).setStroke('#14201b', 2);
    if (label.width > pos.width - 61) label.setScale((pos.width - 61) / label.width, 1);
    chip.add([
      equipmentIcon(this, left + 11, 0, card.name, EQUIPMENT_ROW.iconSize),
      this.add.text(left + 29, 0, suit, { fontFamily: 'serif', fontSize: '13px', color,
        stroke: '#14201b', strokeThickness: 1 }).setOrigin(0.5),
      text(this, left + 44, 0, rank, 13, color).setStroke('#14201b', 1),
      label,
    ]);
    chip.setInteractive({ useHandCursor: true });
    chip.on('pointerover', () => {
      label.setColor('#bcebd5');
      this.hud.preview(this.assets.manifest.cards[card.name], NAMES[card.name] ?? card.name,
        [{ title: '装备效果', body: EQUIPMENT_HELP[card.name] ?? '装备效果详见牌面。' }]);
    });
    chip.on('pointerout', () => { label.setColor('#f3e4bd'); this.hud.preview(); });
    chip.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonReleased() || !this.ready) return;
      const choice = this.model?.leaves.find(item => item.zone === 'equip' && item.cardIds.includes(card.id));
      if (choice) void this.submit(choice);
      else if (this.model?.decision.kind === 'guanshi' && this.model.selectCard(card.id)) this.updateSelection();
    });
  }
  private zonePicker(picks: readonly ZonePick[]) {
    picks.forEach((pick, index) => {
      const { x, y, width, height } = hiddenHandSlot(index, picks.length);
      if (pick.card) {
        this.makeCard(pick.card, x, y, width, height, 50 + index, false);
        this.track(text(this, x, y + height / 2 + (picks.length > 10 ? 4 : 16),
          pick.zone === 'equip' ? this.model?.decision.kind === 'guanshi' ? '装备 · 弃牌费用' : '装备区' : '判定区',
          15, '#c7e2cb').setDepth(51 + index));
        return;
      }
      const back = this.track(cardBack(this, x, y, width, height).setDepth(50 + index)
        .setInteractive({ useHandCursor: true }));
      this.hiddenBacks.set(pick.choice.slot!, back);
      back.on('pointerover', () => back.setDepth(100).setScale(1.08));
      back.on('pointerout', () => back.setDepth(50 + index).setScale(1));
      back.on('pointerdown', () => { if (this.ready) void this.submit(pick.choice); });
      this.track(text(this, x, y + height / 2 + (picks.length > 10 ? 4 : 16),
        `暗手牌 ${pick.choice.slot! + 1}`, 15, '#c7e2cb').setDepth(51 + index));
    });
  }
  private makeCard(card: Card, x: number, y: number, width: number, height: number,
    order: number, draggable = true): CardSprite {
    const { container: view, border } = cardView(this, card, x, y, width, height);
    this.track(view.setDepth(order).setInteractive({ useHandCursor: true }));
    const sprite = { card, view, border, home: { x, y }, order };
    this.cards.push(sprite); if (draggable) this.input.setDraggable(view);
    view.on('pointerover', () => {
      if (this.dragging) return;
      view.setDepth(80);
      this.hud.preview(this.assets.manifest.cards[card.name], `${NAMES[card.name]} · ${card.rank}`);
      if (this.ready && this.model?.selectableCards.includes(card.id)) this.tweens.add({ targets: view, y: y - 17, duration: 110 });
    });
    view.on('pointerout', () => { if (this.dragging) return; this.hud.preview(); this.updateSelection(); });
    view.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonReleased() || pointer.getDistance() >= this.input.dragDistanceThreshold || !this.ready) return;
      const zone = this.model?.leaves.find(choice => choice.zone && choice.zone !== 'hand' && choice.cardIds.includes(card.id));
      if (zone) { void this.submit(zone); return; }
      const toggle = this.model?.scoped.find(c => c.actionType === 'toggle' && c.cardIds.includes(card.id));
      if (toggle) { void this.submit(toggle); return; }
      if (this.model?.selectCard(card.id)) this.updateSelection();
    });
    return sprite;
  }
  private updateSelection() {
    if (this.dragging) return;
    for (const sprite of this.cards) {
      this.tweens.killTweensOf(sprite.view);
      const selected = this.model?.cards.includes(sprite.card.id) || this.model?.selectedByRule.includes(sprite.card.id);
      const selectable = this.model?.selectableCards.includes(sprite.card.id);
      sprite.view.setPosition(sprite.home.x, sprite.home.y - (selected ? 26 : 0)).setDepth(selected ? 85 : sprite.order);
      const owned = this.session.observation.self.hand.some(c => c.id === sprite.card.id);
      sprite.view.setAlpha(owned && !selectable && !selected && this.model ? 0.52 : 1);
      sprite.border.setStrokeStyle(selected ? 3 : 0, COLORS.selected);
    }
    this.drawHighlights(); this.renderHud();
  }
  private drawHighlights(pointer?: Point) {
    this.highlights.clear();
    if (!this.model || this.busy) return;
    for (const id of [...new Set([...this.model.nextTargets, ...this.model.targets])]) {
      const p = this.position(id);
      const selected = this.model.targets.includes(id) || (pointer && inside(pointer, { ...p, width: 214, height: 270 }));
      const y = p.y - (id === this.session.observation.self.id ? 151 : 136);
      this.highlights.fillStyle(COLORS.selected, selected ? 1 : 0.7)
        .fillTriangle(p.x - 12, y - 12, p.x + 12, y - 12, p.x, y + 6);
      if (selected) this.highlights.fillCircle(p.x, y - 18, 4);
    }
  }
  private dragStart(view: Phaser.GameObjects.Container) {
    const sprite = this.cards.find(c => c.view === view);
    this.dragAllowed = this.ready && Boolean(sprite && this.model?.dragCard(sprite.card.id));
    this.dragging = true;
    if (!this.dragAllowed) return;
    this.tweens.killTweensOf(view); view.setDepth(900).setAlpha(1).setScale(1.06);
    this.hud.preview(); this.drawHighlights(); this.renderHud();
  }
  private drag(pointer: Phaser.Input.Pointer, view: Phaser.GameObjects.Container, x: number, y: number) {
    if (!this.dragAllowed) return;
    view.setPosition(x, y);
    const sprite = this.cards.find(c => c.view === view)!;
    this.arrow.clear().lineStyle(3, COLORS.selected, 0.8).lineBetween(sprite.home.x, sprite.home.y - 80, pointer.x, pointer.y);
    this.arrow.fillStyle(COLORS.selected, 1).fillCircle(pointer.x, pointer.y, 5);
    this.drawHighlights(pointer);
  }
  private dragEnd(pointer: Phaser.Input.Pointer, view: Phaser.GameObjects.Container) {
    view.setScale(1); this.arrow.clear(); this.dragging = false;
    const sprite = this.cards.find(c => c.view === view);
    if (!sprite || !this.dragAllowed || !this.model) { this.updateSelection(); return; }
    const target = this.model.nextTargets.find(id => inside(pointer, { ...this.position(id), width: 216, height: 274 }));
    let accepted = false;
    if (target !== undefined) { this.model.selectTarget(target); accepted = true; }
    else if (this.model.decision.kind === 'deckReorder') {
      const side = (['top', 'bottom'] as const).find(side => inside(pointer, REORDER[side]));
      const action = this.model.exact.find(c => c.placement === side);
      if (side && action) { void this.submit(action); return; }
    } else if (inside(pointer, PLAY_AREA)) accepted = true;
    if (accepted) {
      const exact = this.model.exact.filter(c => c.cardIds.length > 0 || c.targetIds.length > 0);
      // Optional extra targets must stay selectable instead of committing the first legal subset.
      if (this.model.decision.kind !== 'discard' && exact.length === 1 && !this.model.nextTargets.length) {
        void this.submit(exact[0]); return;
      }
      this.updateSelection();
    } else {
      this.model.cards = []; this.model.targets = [];
      this.tweens.add({ targets: view, x: sprite.home.x, y: sprite.home.y, duration: 190, ease: 'Cubic.Out', onComplete: () => this.updateSelection() });
      this.drawHighlights(); this.renderHud();
    }
  }
}
