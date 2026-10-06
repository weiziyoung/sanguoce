import type Phaser from 'phaser';
import { cardLabel, type CardName } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';
import type { TableAssets } from './assets.ts';
import type { GameAudio } from './audio.ts';
import { deckPosition, handPosition, handCardPosition, playerPosition, trickTablePosition, discardTablePosition, type Point } from './layout.ts';
import { cardFlight, sampleCardFlight } from './card-flight.ts';
import { cardBack, cardView, text } from './visuals.ts';
import { SoundCueRouter } from './sound-cues.ts';
import { responseCard, type ResponseCard } from './response-card.ts';
import { zoneCardEffect, type ZoneCardEffect } from './zone-card-effect.ts';
import { trickTableCue, type TrickTableCue } from './trick-table-cue.ts';
import { ActionLinkRouter, type ActionLink } from './action-links.ts';
import { tableCardLabel } from './table-card-label.ts';
import { judgementCard, type JudgementCardCue } from './judgement-card.ts';
import { discardTableCard } from './discard-table-card.ts';

/** Only consumes viewer-visible events. Never reads the game state. */
export class TableEffects {
  private cues: SoundCueRouter;
  private links = new ActionLinkRouter();
  private duelCards: { id: number; view: Phaser.GameObjects.Container }[] = [];
  private discardCards: { id: number; player: number; view: Phaser.GameObjects.Container }[] = [];
  private trickTableCards: { id: number; view: Phaser.GameObjects.Container }[] = [];
  private judgementTableCard: { id: number; view: Phaser.GameObjects.Container } | null = null;
  private activeTrick: CardName | null = null;
  private choosingZone = false;
  private landedCards: Phaser.GameObjects.Container[] = [];
  constructor(private scene: Phaser.Scene, assets: TableAssets, private audio: GameAudio) {
    this.cues = new SoundCueRouter(assets.manifest);
  }
  dispose() {
    this.audio.stopEffect(); this.clearTableCards(); this.clearJudgementCard(); this.clearHandFlights();
    for (const card of this.discardCards.splice(0)) card.view.destroy();
  }
  clearHandFlights(): void {
    for (const card of this.landedCards) card.destroy();
    this.landedCards = [];
  }
  hasTableCard(id: number): boolean {
    return this.trickTableCards.some(item => item.id === id) || this.duelCards.some(item => item.id === id) ||
      this.discardCards.some(item => item.id === id) ||
      this.judgementTableCard?.id === id;
  }
  hasActiveJudgementCard(): boolean { return this.judgementTableCard !== null; }
  setZonePickerActive(active: boolean): void {
    if (this.choosingZone === active) return;
    this.choosingZone = active;
    if (!this.activeTrick) return;
    const count = this.trickTableCards.length;
    this.trickTableCards.forEach(({ view }, index) => {
      const destination = trickTablePosition(this.activeTrick!, index, count, active);
      if (active) view.setPosition(destination.x, destination.y);
      else this.scene.tweens.add({ targets: view, ...destination, duration: 220, ease: 'Cubic.Out' });
    });
  }
  private clearTableCards() {
    for (const card of this.duelCards) card.view.destroy();
    for (const card of this.trickTableCards) card.view.destroy();
    this.duelCards = [];
    this.trickTableCards = [];
    this.activeTrick = null;
  }
  private clearJudgementCard() {
    this.judgementTableCard?.view.destroy();
    this.judgementTableCard = null;
  }
  private tween(targets: Phaser.GameObjects.GameObject, config: object): Promise<void> {
    return new Promise(resolve => this.scene.tweens.add({ targets, ...config,
      onComplete: () => { targets.destroy(); resolve(); } }));
  }
  private caption(view: Phaser.GameObjects.Container, value: string | null, y = 99): void {
    if (!value) return;
    view.add(text(this.scene, 0, y, value, 18, '#f6dfa8').setLineSpacing(2));
  }
  private flyIntoHand(sprite: Phaser.GameObjects.Container, destination: Point, self: boolean,
    endScale: number, delay = 0): Promise<void> {
    const path = cardFlight({ x: sprite.x, y: sprite.y }, destination, sprite.scaleX, endScale);
    const clock = { progress: 0 };
    sprite.setVisible(delay === 0);
    return new Promise(resolve => this.scene.tweens.add({
      targets: clock, progress: 1, delay, duration: path.duration, ease: 'Linear',
      onStart: () => sprite.setVisible(true),
      onUpdate: () => {
        const pose = sampleCardFlight(path, clock.progress);
        sprite.setPosition(pose.x, pose.y).setScale(pose.scale).setRotation(pose.rotation);
      },
      onComplete: () => {
        sprite.setPosition(destination.x, destination.y).setScale(endScale).setRotation(0);
        if (self) this.landedCards.push(sprite);
        else sprite.destroy();
        resolve();
      },
    }));
  }
  private handDestination(player: number, obs: Observation, cardId?: number | null): Point {
    const index = cardId == null ? -1 : obs.self.hand.findIndex(card => card.id === cardId);
    return player === obs.self.id && index >= 0 ? handCardPosition(index, obs.self.hand.length) :
      handPosition(player, [obs.self, ...obs.others].map(p => p.id), obs.self.id);
  }
  private async showResponse(card: ResponseCard, obs: Observation, verb = '打出'): Promise<void> {
    const seats = [obs.self, ...obs.others].map(player => player.id);
    const from = handPosition(card.player, seats, obs.self.id);
    const sprite = cardView(this.scene, card.card, from.x, from.y, 116, 166).container
      .setDepth(1100).setScale(0.72);
    this.caption(sprite, `${obs.mode.id === 'identity' ? `座${card.player + 1}` : card.player === obs.self.id ? '你' : '对手'}\n${verb}${cardLabel(card.card)}`, 108);
    await new Promise<void>(resolve => this.scene.tweens.add({ targets: sprite,
      x: 790, y: 486, scale: 1, duration: 360, ease: 'Cubic.Out', onComplete: () => resolve() }));
    await new Promise<void>(resolve => this.scene.time.delayedCall(560, resolve));
    await this.tween(sprite, { y: 462, alpha: 0, duration: 220 });
  }
  private async showJudgement(cue: JudgementCardCue, obs: Observation, origin?: Point): Promise<void> {
    if (cue.kind === 'finish') {
      if (this.judgementTableCard?.id !== cue.card.id) {
        this.clearJudgementCard();
        const from = origin ?? deckPosition(obs.others.length + 1);
        const sprite = cardView(this.scene, cue.card, from.x, from.y, 116, 166).container
          .setDepth(1120).setScale(origin ? 0.93 : 0.65).setAlpha(origin ? 0.66 : 1);
        this.judgementTableCard = { id: cue.card.id, view: sprite };
        this.caption(sprite, cue.label, 111);
        await new Promise<void>(resolve => this.scene.tweens.add({ targets: sprite,
          x: 790, y: 478, scale: 1, alpha: 1, duration: origin ? 180 : 420,
          ease: 'Cubic.Out', onComplete: () => resolve() }));
      } else {
        this.caption(this.judgementTableCard.view, cue.label, 111);
      }
      const sprite = this.judgementTableCard!.view;
      await new Promise<void>(resolve => this.scene.time.delayedCall(850, resolve));
      this.judgementTableCard = null;
      await this.tween(sprite, { y: 454, alpha: 0, duration: 250 });
      return;
    }
    const previous = this.judgementTableCard ?? {
      id: cue.oldCard.id, view: cardView(this.scene, cue.oldCard, 790, 478, 108, 154).container
        .setDepth(1119).setAlpha(0.66),
    };
    this.judgementTableCard = null;
    const replacementOrigin = handPosition(cue.owner,
      [obs.self, ...obs.others].map(player => player.id), obs.self.id);
    const sprite = cardView(this.scene, cue.card, replacementOrigin.x, replacementOrigin.y, 116, 166).container
      .setDepth(1120).setScale(0.65);
    this.caption(sprite, cue.label, 111);
    this.judgementTableCard = { id: cue.card.id, view: sprite };
    await Promise.all([
      new Promise<void>(resolve => this.scene.tweens.add({ targets: sprite,
        x: 790, y: 478, scale: 1, duration: 420, ease: 'Cubic.Out', onComplete: () => resolve() })),
      this.tween(previous.view, { x: 700, alpha: 0, duration: 260 }),
    ]);
  }
  private async showDuelResponse(event: Extract<VisibleEvent, { kind: 'duelResponded' }>,
    obs: Observation): Promise<void> {
    const source = obs.eventCards?.[event.data.card];
    if (!source) return;
    const seats = [obs.self, ...obs.others].map(player => player.id);
    const from = handPosition(event.data.player, seats, obs.self.id);
    const index = this.duelCards.length;
    const lane = event.data.player === obs.self.id ? 546 : 401;
    const x = 605 + Math.min(index, 9) * 68;
    const card = { ...source, name: event.data.effectiveName };
    const sprite = cardView(this.scene, card, from.x, from.y, 100, 144).container
      .setDepth(1080 + index).setScale(0.72).setAlpha(0.92);
    this.caption(sprite, tableCardLabel(event, obs));
    this.duelCards.push({ id: event.data.card, view: sprite });
    await new Promise<void>(resolve => this.scene.tweens.add({ targets: sprite,
      x, y: lane, scale: 0.83, alpha: 1, duration: 390, ease: 'Cubic.Out', onComplete: () => resolve() }));
  }
  private async showDiscard(discard: NonNullable<ReturnType<typeof discardTableCard>>, obs: Observation,
    origin?: Point): Promise<void> {
    if (this.discardCards.length && this.discardCards[0].player !== discard.player) await this.finishDiscards(650);
    if (!this.discardCards.length) await this.finishTableCards(0);
    const from = origin ?? handPosition(discard.player, [obs.self, ...obs.others].map(p => p.id), obs.self.id);
    const sprite = cardView(this.scene, discard.card, from.x, from.y, 100, 144).container
      .setDepth(1080 + this.discardCards.length).setScale(0.72);
    this.caption(sprite, `${obs.mode.id === 'identity' ? `座${discard.player + 1}` : discard.player === obs.self.id ? '你' : '对手'} · 弃置`);
    this.discardCards.push({ id: discard.card.id, player: discard.player, view: sprite });
    await Promise.all(this.discardCards.map(({ view }, index) => new Promise<void>(resolve =>
      this.scene.tweens.add({ targets: view, ...discardTablePosition(index, this.discardCards.length),
        scale: 1, duration: view === sprite ? 340 : 200, ease: 'Cubic.Out', onComplete: () => resolve() }))));
  }
  private async finishDiscards(hold: number): Promise<void> {
    if (!this.discardCards.length) return;
    if (hold) await new Promise<void>(resolve => this.scene.time.delayedCall(hold, resolve));
    await Promise.all(this.discardCards.splice(0).map(({ view }) =>
      this.tween(view, { y: view.y - 24, alpha: 0, duration: 240 })));
  }
  private async showTrickTableCard(cue: Extract<TrickTableCue, { kind: 'start' | 'append' }>,
    obs: Observation): Promise<void> {
    if (cue.kind === 'start' || this.activeTrick !== cue.cname) this.clearTableCards();
    this.activeTrick = cue.cname;
    const seats = [obs.self, ...obs.others].map(player => player.id);
    const from = handPosition(cue.player, seats, obs.self.id);
    const index = this.trickTableCards.length;
    const sprite = cardView(this.scene, cue.card, from.x, from.y, 100, 144).container
      .setDepth(1060 + index).setScale(0.72);
    const visible = obs.events.find(event => event.kind === (cue.kind === 'append' ? 'nullificationUsed' : 'cardUsed') &&
      event.data.card === cue.card.id);
    this.caption(sprite, visible ? tableCardLabel(visible, obs) : null);
    this.trickTableCards.push({ id: cue.card.id, view: sprite });
    const count = this.trickTableCards.length;
    await Promise.all(this.trickTableCards.map(({ view }, i) => new Promise<void>(resolve =>
      this.scene.tweens.add({ targets: view,
        ...trickTablePosition(cue.cname, i, count, this.choosingZone),
        scale: 0.84, duration: view === sprite ? 390 : 270,
        ease: 'Cubic.Out', onComplete: () => resolve() }))));
  }
  private async finishTableCards(hold: number): Promise<void> {
    if (!this.duelCards.length && !this.trickTableCards.length) return;
    if (hold) await new Promise<void>(resolve => this.scene.time.delayedCall(hold, resolve));
    const cards = [...this.duelCards.splice(0).map(item => item.view),
      ...this.trickTableCards.splice(0).map(item => item.view)];
    this.activeTrick = null;
    await Promise.all(cards.map(card => this.tween(card, { y: card.y - 24, alpha: 0,
      duration: 280, ease: 'Cubic.In' })));
  }
  private async showHarvestChoice(event: Extract<VisibleEvent, { kind: 'harvestTaken' }>,
    obs: Observation, origin?: Point): Promise<void> {
    const card = obs.eventCards?.[event.data.card];
    if (!card) return;
    const from = origin ?? { x: 790, y: 490 };
    const sprite = cardView(this.scene, card, from.x, from.y, 120, 172).container
      .setDepth(1140).setScale(0.9);
    const self = event.data.player === obs.self.id;
    await this.flyIntoHand(sprite, this.handDestination(event.data.player, obs, event.data.card),
      self, self ? 1 : 54 / 120);
  }
  private flashDamage(target: number, obs: Observation): Promise<void> {
    const p = playerPosition(target, [obs.self, ...obs.others].map(player => player.id), obs.self.id);
    const self = target === obs.self.id;
    const veil = this.scene.add.rectangle(p.x + 10, p.y - 10, self ? 160 : 168,
      self ? 208 : 226, 0xf0302d, 0.58).setDepth(1050);
    return new Promise(resolve => this.scene.tweens.add({ targets: veil, alpha: 0,
      duration: 520, ease: 'Sine.Out', onComplete: () => { veil.destroy(); resolve(); } }));
  }
  private transferSprite(effect: ZoneCardEffect, obs: Observation, from: Point) {
    const faceUp = effect.selection.fromZone !== 'hand' || effect.from === obs.self.id;
    return (faceUp && effect.card
      ? cardView(this.scene, effect.card, from.x, from.y, 110, 154).container
      : cardBack(this.scene, from.x, from.y, 110, 154)).setDepth(1150);
  }
  private async dismantle(effect: ZoneCardEffect, obs: Observation, from: Point): Promise<void> {
    const sprite = this.transferSprite(effect, obs, from);
    await new Promise<void>(resolve => this.scene.tweens.add({ targets: sprite,
      x: from.x + 5, angle: 5, scale: 1.06, duration: 90, yoyo: true,
      onComplete: () => resolve() }));
    const slash = this.scene.add.graphics().setDepth(1160);
    slash.lineStyle(3, 0xffdfaa, 0.92).beginPath()
      .moveTo(from.x - 42, from.y - 75).lineTo(from.x - 12, from.y - 28)
      .lineTo(from.x + 4, from.y - 33).lineTo(from.x + 40, from.y + 77).strokePath();
    const fragments = Array.from({ length: 7 }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      const shard = this.scene.add.triangle(from.x + side * (12 + index * 4), from.y + (index - 3) * 16,
        0, 0, 12, 3, 4, 15, index % 3 ? 0xd3b47c : 0xeee0bd).setDepth(1161);
      return this.tween(shard, { x: shard.x + side * (38 + index * 7),
        y: shard.y + (index - 3) * 12 - 20, angle: side * 75, alpha: 0,
        duration: 420, ease: 'Cubic.Out' });
    });
    await Promise.all([
      this.tween(sprite, { x: from.x + 24, y: from.y + 20, angle: 18,
        scale: 0.72, alpha: 0, duration: 420, ease: 'Cubic.In' }),
      this.tween(slash, { alpha: 0, duration: 420 }), ...fragments,
    ]);
  }
  private async steal(effect: Extract<ZoneCardEffect, { kind: 'gain' }>, obs: Observation,
    from: Point): Promise<void> {
    const self = effect.to === obs.self.id;
    // Keep an opponent's hidden hand face down until the normal observation redraw.
    const faceUp = effect.selection.fromZone !== 'hand' || effect.from === obs.self.id;
    const sprite = (faceUp && effect.card
      ? cardView(this.scene, effect.card, from.x, from.y, 120, 172).container
      : cardBack(this.scene, from.x, from.y, 120, 172)).setDepth(1150).setScale(0.92);
    await this.flyIntoHand(sprite, this.handDestination(effect.to, obs, effect.cardId),
      self, self ? 1 : 54 / 120);
  }
  private async showActionLinks(links: ActionLink[], obs: Observation): Promise<void> {
    if (!links.length) return;
    const seats = [obs.self, ...obs.others].map(p => p.id);
    const marks = links.map((link, index) => {
      const a = playerPosition(link.from, seats, obs.self.id);
      const b = playerPosition(link.to, seats, obs.self.id);
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) return null;
      const ux = dx / length, uy = dy / length;
      const start = { x: a.x + ux * 84, y: a.y + uy * 84 };
      const end = { x: b.x - ux * 84, y: b.y - uy * 84 };
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const tailLength = Math.min(150, distance * 0.3);
      const color = link.helpful ? 0x9edaa9 : 0xffc279;
      const graphic = this.scene.add.graphics().setDepth(1200 + index);
      const caption = text(this.scene, (start.x + end.x) / 2,
        (start.y + end.y) / 2 - 22 - index * 25, link.label, 22,
        link.helpful ? '#c1e9b9' : '#ffe1ad').setDepth(1201 + index).setAlpha(0);
      const draw = (progress: number) => {
        const tip = { x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress };
        const travelled = distance * progress;
        const tailStart = Math.max(0, travelled - tailLength);
        graphic.clear().lineStyle(1, color, 0.14).lineBetween(start.x, start.y, tip.x, tip.y);
        // Short, tapered light streak; its arrowhead stays visible throughout the flight.
        for (let segment = 0; segment < 8; segment++) {
          const brightness = (segment + 1) / 8;
          const from = tailStart + (travelled - tailStart) * segment / 8;
          const to = tailStart + (travelled - tailStart) * brightness;
          const x1 = start.x + ux * from, y1 = start.y + uy * from;
          const x2 = start.x + ux * to, y2 = start.y + uy * to;
          graphic.lineStyle(5 + brightness * 4, color, brightness * 0.08).lineBetween(x1, y1, x2, y2)
            .lineStyle(1 + brightness * 1.6, color, brightness * 0.9).lineBetween(x1, y1, x2, y2);
        }
        if (travelled > 0) graphic.fillStyle(color, 1).fillTriangle(tip.x, tip.y,
          tip.x - ux * 13 - uy * 5, tip.y - uy * 13 + ux * 5,
          tip.x - ux * 13 + uy * 5, tip.y - uy * 13 - ux * 5);
        if (progress > 0.9) graphic.fillStyle(color, (progress - 0.9) * 1.5).fillCircle(end.x, end.y, 11);
        caption.setAlpha(Math.min(1, progress * 4));
      };
      return { graphic, caption, draw };
    }).filter((mark): mark is { graphic: Phaser.GameObjects.Graphics;
      caption: Phaser.GameObjects.Text; draw(progress: number): void } => Boolean(mark));
    await Promise.all(marks.map(mark => new Promise<void>(resolve => {
      const progress = { value: 0 };
      this.scene.tweens.add({ targets: progress, value: 1, duration: 220, ease: 'Linear',
        onUpdate: () => mark.draw(progress.value), onComplete: () => resolve() });
    })));
    await new Promise<void>(resolve => this.scene.time.delayedCall(220, resolve));
    await Promise.all(marks.flatMap(mark => [
      this.tween(mark.graphic, { alpha: 0, duration: 100 }),
      this.tween(mark.caption, { alpha: 0, duration: 100 }),
    ]));
  }
  async play(event: VisibleEvent, obs: Observation, origin?: Point): Promise<void> {
    const position = (id: number) => playerPosition(id, [obs.self, ...obs.others].map(p => p.id), obs.self.id);
    const response = responseCard(event, obs);
    const judgement = judgementCard(event, obs);
    const transfer = zoneCardEffect(event, obs);
    const discarded = discardTableCard(event, obs);
    const trickCue = trickTableCue(event, obs);
    if (trickCue?.kind === 'clear' || trickCue?.kind === 'start')
      await this.finishDiscards(event.kind === 'turnStarted' ? 650 : 0);
    if (trickCue?.kind === 'clear') await this.finishTableCards(0);
    // Finish clearing the previous play before starting this play's voice, links and card together.
    const sounds = this.audio.muted ? [] : this.cues.sounds(event, obs);
    for (const sound of sounds) void this.audio.playEffect(sound, { allowOverlap: event.kind === 'duelResponded' });
    const linkAnimation = this.showActionLinks(this.links.links(event, obs), obs);
    if (trickCue?.kind === 'start' || trickCue?.kind === 'append') {
      await this.showTrickTableCard(trickCue, obs);
    } else if (trickCue?.kind === 'end') {
      await this.finishTableCards(750);
    } else if (event.kind === 'cardUsed') {
      const card = obs.eventCards?.[event.data.card];
      if (card) {
        const from = position(event.data.source);
        const sprite = cardView(this.scene, card, from.x, from.y, 94, 135).container.setDepth(1000);
        this.caption(sprite, tableCardLabel(event, obs), 94);
        await new Promise<void>(resolve => this.scene.tweens.add({ targets: sprite,
          x: 790, y: 486, duration: 270, ease: 'Cubic.Out', onComplete: () => resolve() }));
        await new Promise<void>(resolve => this.scene.time.delayedCall(680, resolve));
        await this.tween(sprite, { y: 462, alpha: 0, duration: 220 });
      }
    } else if (event.kind === 'cardRevealed') {
      const card = obs.eventCards?.[event.data.card];
      if (card) await this.showResponse({ player: event.data.player, card }, obs, '展示');
    } else if (event.kind === 'harvestTaken') {
      await this.showHarvestChoice(event, obs, origin);
    } else if (event.kind === 'duelResponded') {
      await this.showDuelResponse(event, obs);
    } else if (judgement) {
      await this.showJudgement(judgement, obs, origin);
    } else if (response) {
      await this.showResponse(response, obs);
    } else if (transfer) {
      const seats = [obs.self, ...obs.others].map(player => player.id);
      const from = origin ?? handPosition(transfer.from, seats, obs.self.id);
      if (transfer.kind === 'gain') await this.steal(transfer, obs, from);
      else await this.dismantle(transfer, obs, from);
    } else if (discarded) {
      await this.showDiscard(discarded, obs, origin);
    } else if (event.kind === 'drawn') {
      const count = Math.min(8, event.data.count);
      const self = event.data.player === obs.self.id;
      const deck = deckPosition(obs.others.length + 1);
      const handCount = Math.max(count, obs.self.hand.length);
      await Promise.all(Array.from({ length: count }, (_, index) => {
        const destination = self ? handCardPosition(handCount - count + index, handCount) :
          this.handDestination(event.data.player, obs);
        const back = cardBack(this.scene, deck.x, deck.y, 120, 172).setDepth(1000 + index).setScale(0.52);
        return this.flyIntoHand(back, destination, self, self ? 1 : 54 / 120, index * 55);
      }));
    } else if (event.kind === 'damaged' || event.kind === 'recovered') {
      const p = position(event.kind === 'damaged' ? event.data.target : event.data.player);
      const value = text(this.scene, p.x, p.y - 45, `${event.kind === 'damaged' ? '−' : '+'}${event.data.amount}`,
        62, event.kind === 'damaged' ? '#ff7565' : '#bde49f').setDepth(1000);
      await Promise.all([
        this.tween(value, { y: p.y - 115, alpha: 0, duration: 560 }),
        ...(event.kind === 'damaged' ? [this.flashDamage(event.data.target, obs)] : []),
      ]);
    } else if (event.kind === 'skillActivated') {
      const p = position(event.data.owner);
      const title = text(this.scene, p.x, p.y, event.data.label, 42).setDepth(1000);
      await this.tween(title, { y: p.y - 60, alpha: 0, duration: 620 });
    }
    await linkAnimation;
  }
}
