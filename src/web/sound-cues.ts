import { cardAssetKey } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';
import type { AssetManifest, CardVoices } from './assets.ts';

/** Logical cue names stay stable even where the supplied filename differs. */
export const SYSTEM_SOUND_FILES = {
  game_start: 'gamestart.mp3', game_end: 'gameEnd.mp3',
  raw_addhp: 'raw_addhp.mp3', raw_equip: 'raw_equip.mp3',
  passbutton: 'passbutton.mp3',
  raw_hit_new: 'raw_hit_new.mp3', raw_hit_new2: 'raw_hit_new2.mp3',
  raw_hit_old: 'raw_hit_old.mp3', raw_hit_lei2: 'raw_hit_lei2.mp3',
  dead: 'dead.mp3',
} as const;
export type SystemSoundName = keyof typeof SYSTEM_SOUND_FILES;
const HIT_VARIANTS = ['raw_hit_new', 'raw_hit_new2', 'raw_hit_old'] as const;
type SkillClipPicker = (key: string, clips: readonly string[]) => string | undefined;
const firstClip: SkillClipPicker = (_key, clips) => clips[0];

export class SoundCueRouter {
  private nextClip = new Map<string, number>();
  private manifest: AssetManifest;
  constructor(manifest: AssetManifest) { this.manifest = manifest; }
  sounds(event: VisibleEvent, obs: Observation): string[] {
    return eventSounds(event, obs, this.manifest, Math.random, (key, clips) => {
      const index = this.nextClip.get(key) ?? 0;
      this.nextClip.set(key, index + 1);
      return clips[index % clips.length];
    });
  }
}

export function cardVoice(voices: CardVoices | undefined, sex?: 'male' | 'female'): string | undefined {
  return sex === 'female' ? voices?.female ?? voices?.male : voices?.male ?? voices?.female;
}

/** Sound routing sees only public events and the viewer's observation. */
export function eventSounds(event: VisibleEvent, obs: Observation, manifest: AssetManifest,
  random: () => number = Math.random, pickSkillClip: SkillClipPicker = firstClip): string[] {
  const sounds: (string | undefined)[] = [];
  const player = (id: number) => [obs.self, ...obs.others].find(item => item.id === id);
  const sex = (id: number) => player(id)?.sex;
  const skillVoice = (id: number, ability: string) => {
    const general = player(id)?.general;
    if (!general) return undefined;
    const voices = manifest.generalAudio[general];
    const skill = voices?.aliases[ability] ?? ability;
    const clips = voices?.skills[skill];
    return clips?.length ? pickSkillClip(`${general}:${skill}`, clips) : undefined;
  };
  const conversionAfter = (id: number, player: number) => obs.events.some(next =>
    next.kind === 'transformationUsed' && next.data.owner === player &&
    next.id > id && next.id - id <= 4);
  if (event.kind === 'cardUsed') {
    const card = obs.eventCards?.[event.data.card];
    const name = event.data.effectiveName ?? (card ? cardAssetKey(card) : undefined);
    if (name) sounds.push(cardVoice(manifest.cardAudio[name], sex(event.data.source)));
  } else if (event.kind === 'delayPlaced') {
    const card = obs.eventCards?.[event.data.card];
    const name = event.data.effectiveName ?? (card ? cardAssetKey(card) : undefined);
    if (name) sounds.push(cardVoice(manifest.cardAudio[name], sex(event.data.source)));
  } else if (event.kind === 'discarded' &&
    (event.data.reason === 'respond' || event.data.reason === 'use') &&
    event.data.responseMode !== 'juedou' &&
    !conversionAfter(event.id, event.data.player)) {
    const card = obs.eventCards?.[event.data.card];
    const name = card ? cardAssetKey(card) : undefined;
    if (name) sounds.push(cardVoice(manifest.cardAudio[name], sex(event.data.player)));
  } else if (event.kind === 'transformationUsed') {
    sounds.push(skillVoice(event.data.owner, event.data.ability));
    const name = event.data.produces ?? 'sha';
    const separatelyAnnounced = obs.events.some(next => next.id > event.id && next.id - event.id <= 4 &&
      ((next.kind === 'cardUsed' && next.data.source === event.data.owner && next.data.effectiveName === name) ||
       (next.kind === 'delayPlaced' && next.data.source === event.data.owner && next.data.effectiveName === name) ||
       (next.kind === 'cardRecast' && next.data.player === event.data.owner && name === 'tiesuo')));
    if (!separatelyAnnounced && event.data.responseMode !== 'juedou')
      sounds.push(cardVoice(manifest.cardAudio[name], sex(event.data.owner)));
  } else if (event.kind === 'cardRecast') {
    sounds.push(cardVoice(manifest.cardAudio.tiesuoRecast, sex(event.data.player)));
  } else if (event.kind === 'duelResponded') {
    sounds.push(cardVoice(manifest.cardAudio[event.data.effectiveName], sex(event.data.player)));
  } else if (event.kind === 'abilityActivated' && event.data.effect === 'virtualSha' && event.data.owner !== null) {
    sounds.push(cardVoice(manifest.cardAudio.sha, sex(event.data.owner)));
  } else if (event.kind === 'skillActivated') {
    sounds.push(event.data.ability.startsWith('junzheng.') ?
      cardVoice(manifest.cardAudio[event.data.ability.slice('junzheng.'.length)], sex(event.data.owner)) :
      skillVoice(event.data.owner, event.data.ability));
  } else if (event.kind === 'judgementReplaced') {
    sounds.push(skillVoice(event.data.owner, event.data.ability));
  } else if (event.kind === 'recovered') {
    sounds.push(manifest.systemAudio.raw_addhp);
  } else if (event.kind === 'equipped') {
    if (!event.data.replaced) {
      const card = obs.eventCards?.[event.data.card];
    const name = card ? cardAssetKey(card) : undefined;
      if (name) sounds.push(cardVoice(manifest.cardAudio[name], sex(event.data.player)));
      sounds.push(manifest.systemAudio.raw_equip);
    }
  } else if (event.kind === 'died') {
    const general = player(event.data.target)?.general;
    sounds.push((general && manifest.generalAudio[general]?.death) || manifest.systemAudio.dead);
  } else if (event.kind === 'damaged') {
    const cause = event.data.card;
    const causeName = typeof cause === 'number' ?
      (obs.eventCards?.[cause] ?? (obs.discardTop?.id === cause ? obs.discardTop : null))?.name : cause?.name;
    const key = event.data.nature === 'thunder' || causeName === 'shandian' ? 'raw_hit_lei2' :
      HIT_VARIANTS[Math.min(HIT_VARIANTS.length - 1, Math.floor(random() * HIT_VARIANTS.length))];
    sounds.push(manifest.systemAudio[key]);
  }
  return sounds.filter((sound): sound is string => Boolean(sound));
}
