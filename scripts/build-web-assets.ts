import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CARD_SPECS } from '../catalog.ts';
const ART_SPECS = [...CARD_SPECS, { id: 'huosha', label: '火杀' }, { id: 'leisha', label: '雷杀' }];
const AUDIO_SPECS = [...ART_SPECS, { id: 'tiesuoRecast', label: '重铸' }];
import { standardContent } from '../src/content/standard/content.ts';
import { standardGeneralDefinitions } from '../src/content/standard/generals.ts';
import { SYSTEM_SOUND_FILES } from '../src/web/sound-cues.ts';
import type { CardVoices, AssetManifest } from '../src/web/assets.ts';
import { HEALTH_PIP_STATES } from '../src/web/health-pips.ts';
import type { HealthPipState } from '../src/web/health-pips.ts';
import { cardAudioSource } from './card-audio-source.ts';

const source = resolve(import.meta.dirname, '../../素材');
const output = resolve(import.meta.dirname, '../public/assets');
// Public checkouts use the bundled assets. Regeneration is an explicit local task.
if (!process.argv.includes('--refresh') && existsSync(join(output, 'manifest.json'))) {
  console.log('Web assets: using bundled public/assets');
  process.exit(0);
}
if (!existsSync(source)) throw new Error('素材源目录不存在；请使用仓库自带的 public/assets，或配置本地素材后再重新生成。');
rmSync(output, { recursive: true, force: true });
const manifest: AssetManifest = { cards: {}, generals: {}, cardAudio: {}, generalAudio: {}, systemAudio: {} };

function add(file: string, destination: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const target = join(output, destination);
  mkdirSync(resolve(target, '..'), { recursive: true });
  copyFileSync(file, target);
  return `/assets/${destination}`;
}

manifest.background = add(join(source, '背景/牌桌背景-1920x1080.png'), 'background.png');
manifest.cardBack = add(join(source, '三国杀卡牌全高清图/新卡牌背面.png'), 'cards/back.png');
manifest.healthPips = Object.fromEntries(HEALTH_PIP_STATES.map(state => {
  const file = resolve(import.meta.dirname, `../public/ui/health-pips-v1/${state}.png`);
  const url = add(file, `ui/health-pips-v1/${state}.png`);
  if (!url) throw new Error(`Missing health pip: ${file}`);
  return [state, url];
})) as Record<HealthPipState, string>;
manifest.bgm = add(join(source, 'bgm/三国策.mp3'), 'bgm/三国策.mp3');
manifest.outsideBgm = add(join(source, 'bgm/战前筹帷.mp3'), 'bgm/战前筹帷.mp3');
const mobileAudio = resolve(source, '../../素材/移动版/移动版语音图片字体包/语音');
for (const [key, filename] of Object.entries(SYSTEM_SOUND_FILES)) {
  const url = add(join(mobileAudio, filename), `audio/system/${key}.mp3`);
  if (url) manifest.systemAudio[key as keyof typeof SYSTEM_SOUND_FILES] = url;
}
add(join(source, '字体/wenq.ttf'), 'fonts/wenq.ttf');
const cardDirs = ['标准篇卡牌/基本牌', '标准篇卡牌/武器', '标准篇卡牌/防具',
  '三国杀卡牌全高清图/军争', '标准篇卡牌/马', '标准篇卡牌/锦囊', '三国杀卡牌全高清图/EX'];
for (const card of ART_SPECS) {
  // Keep the user-supplied full Hualiu face outside the regenerated asset folder.
  if (card.id === 'hualiu') {
    const result = add(resolve(import.meta.dirname, '../public/ui/card-art/hualiu.png'), 'cards/hualiu.png');
    if (result) { manifest.cards[card.id] = result; continue; }
  }
  for (const dir of cardDirs) {
    const result = add(join(source, dir, `${card.label}.png`), `cards/${card.id}.png`);
    if (result) { manifest.cards[card.id] = result; break; }
  }
  if (!manifest.cards[card.id]) throw new Error(`缺少卡牌图片：${card.label}`);
}
for (const general of standardGeneralDefinitions) {
  const image = add(join(source, '三国杀卡牌全高清图/标准25', `${general.label}.png`),
    `generals/${general.id}.png`);
  if (image) manifest.generals[general.id] = image;
  const groupDir = { wei: '魏国', shu: '蜀国', wu: '吴国', qun: '群雄' }[general.group ?? 'wei'];
  const groupPath = join(source, '三国杀配音', groupDir);
  if (!existsSync(groupPath)) continue;
  const generalDir = readdirSync(groupPath).find(entry => /^\d+-/.test(entry) && entry.split('-')[1] === general.label);
  if (!generalDir) continue;
  const base = join(groupPath, generalDir);
  const voiceDirs = ['标/普通', '普通'];
  const voiceDir = voiceDirs.find(dir => existsSync(join(base, dir)));
  if (!voiceDir) continue;
  const folder = join(base, voiceDir);
  const voices: AssetManifest['generalAudio'][string] = { skills: {}, aliases: {} };
  voices.death = add(join(folder, '阵亡.mp3'), `audio/generals/${general.id}/death.mp3`);
  for (const ability of general.abilities) {
    const skill = standardContent.requireSkill(ability);
    const label = skill.label;
    if (!label) continue;
    const clips = [1, 2].map(index => add(join(folder, `${label}${index}.mp3`),
      `audio/generals/${general.id}/${ability}-${index}.mp3`)).filter((clip): clip is string => Boolean(clip));
    if (!clips.length) continue;
    voices.skills[ability] = clips;
    if (skill.transformation) voices.aliases[skill.transformation.id] = ability;
    for (const transformation of skill.transformations ?? []) voices.aliases[transformation.id] = ability;
  }
  const entrance = audioFiles(base).find(file => file.endsWith('/登场.mp3'));
  voices.selection = (entrance && add(entrance, `audio/generals/${general.id}/selection.mp3`)) ||
    Object.values(voices.skills)[0]?.[0];
  manifest.generalAudio[general.id] = voices;
}
const audioRoot = join(source, '三国杀配音/卡牌配音');
function audioFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? audioFiles(path) : entry.name.endsWith('.mp3') ? [path] : [];
  });
}
const allCardAudio = audioFiles(audioRoot);
function voicePriority(path: string): number {
  if (path.includes('/音乐/手杀/')) return 5;
  if (path.includes('/音乐/ol经典版/')) return 4;
  if (path.includes('/音乐/旧互通版/')) return 3;
  if (path.includes('/音效/')) return 2;
  return 1;
}
for (const card of AUDIO_SPECS) {
  const candidates = allCardAudio.filter(path => {
    const filename = path.slice(path.lastIndexOf('/') + 1);
    return path.split('/').at(-2) === card.label && (filename === '男.mp3' || filename === '女.mp3') ||
      filename === `${card.label}.mp3`;
  }).sort((a, b) => voicePriority(b) - voicePriority(a));
  const voices: CardVoices = {};
  for (const sex of ['male', 'female'] as const) {
    const file = cardAudioSource(card.label, sex, candidates);
    if (file) voices[sex] = add(file, `audio/cards/${card.id}-${sex}.mp3`);
  }
  if (!voices.male || !voices.female) throw new Error(`缺少卡牌语音：${card.label}`);
  if (voices.male || voices.female) manifest.cardAudio[card.id] = voices;
}
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Web assets: ${Object.keys(manifest.cards).length} cards, ${Object.keys(manifest.generals).length} generals, ` +
  `${Object.keys(manifest.cardAudio).length} card sounds, ` +
  `${Object.values(manifest.generalAudio).reduce((count, voice) => count + Object.values(voice.skills).reduce((sum, clips) => sum + clips.length, 0), 0)} skill clips, ` +
  `${Object.values(manifest.generalAudio).filter(voice => voice.death).length} death voices, ` +
  `${Object.values(manifest.generalAudio).filter(voice => voice.selection).length} selection voices, ` +
  `${Object.keys(manifest.systemAudio).length} system sounds`);
