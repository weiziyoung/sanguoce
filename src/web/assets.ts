import type Phaser from 'phaser';
import type { Observation } from '../../contracts.ts';
import type { Card } from '../../catalog.ts';
import type { SystemSoundName } from './sound-cues.ts';
import { HEALTH_PIP_STATES, healthPipTexture, healthPipSourceTexture, type HealthPipState } from './health-pips.ts';

export interface CardVoices { male?: string; female?: string; }
export interface GeneralVoices { skills: Record<string, string[]>; aliases: Record<string, string>;
  selection?: string; death?: string; }

export interface AssetManifest {
  background?: string;
  cardBack?: string;
  bgm?: string;
  outsideBgm?: string;
  healthPips?: Record<HealthPipState, string>;
  cards: Record<string, string>;
  generals: Record<string, string>;
  cardAudio: Record<string, CardVoices>;
  generalAudio: Record<string, GeneralVoices>;
  systemAudio: Partial<Record<SystemSoundName, string>>;
}
export class TableAssets {
  readonly manifest: AssetManifest;
  constructor(manifest: AssetManifest) { this.manifest = manifest; }

  prepareHealthPips(scene: Phaser.Scene): void {
    for (const state of HEALTH_PIP_STATES) {
      const key = healthPipTexture(state);
      if (scene.textures.exists(key) || !scene.textures.exists(healthPipSourceTexture(state))) continue;
      let source = scene.textures.get(healthPipSourceTexture(state)).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      // Average the high-resolution artwork progressively instead of sampling a few
      // original pixels per screen pixel. Keep alpha; never paint a background.
      while (source.width > 64) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.max(64, Math.ceil(source.width / 2));
        const context = canvas.getContext('2d')!;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        source = canvas;
      }
      if (source instanceof HTMLCanvasElement) scene.textures.addCanvas(key, source);
      else scene.textures.addImage(key, source);
    }
  }

  async ensure(scene: Phaser.Scene, observation: Observation): Promise<void> {
    const players = [observation.self, ...observation.others];
    const cards = [...observation.self.hand, ...observation.table, ...Object.values(observation.eventCards ?? {}),
      ...(observation.discardTop ? [observation.discardTop] : []), ...players.flatMap(player =>
        [...Object.values(player.equip).filter((card): card is Card => card !== null), ...player.judge])];
    const files = new Map<string, string>();
    for (const player of players) if (player.general && this.manifest.generals[player.general])
      files.set(player.general, this.manifest.generals[player.general]);
    for (const card of cards) if (this.manifest.cards[card.name]) files.set(`card:${card.name}`, this.manifest.cards[card.name]);
    for (const event of observation.events) if (event.kind === 'transformationUsed' && event.data.produces) {
      const name = event.data.produces;
      if (this.manifest.cards[name]) files.set(`card:${name}`, this.manifest.cards[name]);
    }
    for (const [key] of files) if (scene.textures.exists(key)) files.delete(key);
    if (!files.size) return;
    for (const [key, url] of files) scene.load.image(key, url);
    await new Promise<void>(resolve => { scene.load.once('complete', resolve); scene.load.start(); });
  }
}
