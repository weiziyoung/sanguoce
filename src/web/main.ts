import Phaser from 'phaser';
import { generalPackLabel, type GeneralPack, type CardSet } from '../app/game-content.ts';
import { TableAssets, type AssetManifest } from './assets.ts';
import { SelectionScene } from './selection-scene.ts';
import { TableScene } from './table-scene.ts';
import { BOARD } from './layout.ts';
import { GameAudio } from './audio.ts';
import { BootScreen } from './boot-screen.ts';
import { browserSettings } from './settings.ts';
import { SettingsPanel } from './settings-panel.ts';
import { resourceUrl, resolveAssetManifest } from './deployment.ts';
import { bindModeSelection, generalPacksFromQuery, cardsFromQuery, createBrowserSession, gameUrl, type WebMode } from './game-setup.ts';
import './style.css';

async function imageReady(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  await image.decode();
}

async function main(boot: BootScreen) {
  const query = new URLSearchParams(location.search);
  const value = Number(query.get('seed'));
  const seed = query.has('seed') && Number.isInteger(value) && value >= 0 ? value : crypto.getRandomValues(new Uint32Array(1))[0];
  boot.set(0.08, '正在读取资源清单…');
  const response = await fetch(resourceUrl('/assets/manifest.json'));
  if (!response.ok) throw new Error('资源加载失败，请运行 npm run assets:web 后刷新');
  const manifest = resolveAssetManifest(await response.json() as AssetManifest);
  const audio = new GameAudio(manifest.bgm, manifest.outsideBgm, manifest.systemAudio.passbutton);
  const musicHint = document.getElementById('music-unlock')!;
  audio.onMusicBlocked = blocked => musicHint.classList.toggle('hidden', !blocked);
  const settings = browserSettings();
  new SettingsPanel(settings, audio, manifest.cardAudio.wuzhong?.male ?? manifest.cardAudio.sha?.male
    ?? manifest.cardAudio.sha?.female ?? manifest.systemAudio.game_start);
  boot.set(0.2, '正在加载音乐、字体与画面…');
  const resources: ((progress: (fraction: number) => void) => Promise<unknown>)[] = [
    progress => audio.prepareMusic(progress),
    () => document.fonts.load('24px Wenq', '三国杀'),
    () => imageReady(resourceUrl('/boot-scene-v2.png')),
    ...(manifest.background ? [() => imageReady(manifest.background!)] : []),
    ...(manifest.cardBack ? [() => imageReady(manifest.cardBack!)] : []),
  ];
  const progress = resources.map(() => 0);
  const update = (index: number, fraction: number) => {
    progress[index] = fraction;
    const musicPending = progress[0] < 1 && progress.slice(1).every(value => value === 1);
    boot.set(0.2 + progress.reduce((sum, value) => sum + value, 0) / resources.length * 0.55,
      musicPending ? '正在加载背景音乐…' : '正在加载音乐、字体与画面…');
  };
  await Promise.all(resources.map(async (load, index) => {
    await load(fraction => update(index, fraction));
    update(index, 1);
  }));
  if (!document.fonts.check('24px Wenq', '三国杀')) throw new Error('字体加载失败，请刷新重试');
  document.documentElement.classList.add('font-ready');
  const assets = new TableAssets(manifest);
  audio.startOutside();
  document.getElementById('seed')!.textContent = `种子 ${seed}`;
  const modes = document.getElementById('mode-select')!;
  document.getElementById('mode-seed')!.textContent = `本局随机种子 ${seed}`;
  const start = (mode: WebMode, cards: CardSet, generalPacks: GeneralPack[] = [], fromModeSelection = false) => {
    if (fromModeSelection) boot.show('正在打开点将册…');
    else boot.set(0.75, '正在打开点将册…');
    audio.startOutside();
    modes.classList.add('hidden');
    const session = createBrowserSession(mode, seed, cards, generalPacks);
    document.getElementById('app')!.classList.toggle('identity', mode === 'identity');
    document.getElementById('brand-mode')!.textContent = `${mode === 'identity' ? '五人身份' : '对决'} · ${cards === 'junzheng' ? '标准＋军争' : '标准'}${generalPacks.length ? ' · ' + generalPackLabel(generalPacks) : ''}`;
    document.getElementById('restart')!.onclick = () => {
      window.setTimeout(() => { location.href = gameUrl(location.pathname, cards, mode, generalPacks); }, audio.muted ? 0 : 260);
    };
    document.getElementById('return-home')!.onclick = () => {
      window.setTimeout(() => { location.href = gameUrl(location.pathname, cards, undefined, generalPacks); }, audio.muted ? 0 : 260);
    };
    new Phaser.Game({ type: Phaser.AUTO, parent: 'game-canvas', ...BOARD,
      backgroundColor: '#111b1a', render: { antialias: true, mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
      loader: { crossOrigin: 'anonymous' },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new SelectionScene(session, assets, audio,
        progress => boot.set((fromModeSelection ? 0 : 0.75) + progress * (fromModeSelection ? 0.95 : 0.2), '正在加载武将与牌桌…'),
        () => { void boot.complete(); }, settings), new TableScene(session, assets, audio, settings)] });
  };
  bindModeSelection(document, query, (mode, cards, generalPacks) => start(mode, cards, generalPacks, true));
  const fullscreen = document.getElementById('fullscreen')!;
  fullscreen.onclick = () => {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void request.catch(() => { fullscreen.textContent = '全屏不可用'; });
  };
  document.addEventListener('fullscreenchange', () => { fullscreen.textContent = document.fullscreenElement ? '退出全屏' : '全屏'; });
  const requested = query.get('mode');
  if (requested === 'duel' || requested === 'identity') start(requested, cardsFromQuery(query), generalPacksFromQuery(query));
  else {
    await boot.complete();
    modes.classList.remove('hidden');
  }
}
const boot = new BootScreen();
void main(boot).catch(error => boot.fail(error));
