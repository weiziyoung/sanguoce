import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import type { Card } from '../../catalog.ts';
import type { GameState } from '../../src/domain/state.ts';
import type { BrowserSession } from '../../src/app/browser-session.ts';
import type { ActionChoice } from '../../src/presentation/choice-view.ts';
import { TableAssets } from '../../src/web/assets.ts';
import type { GameAudio } from '../../src/web/audio.ts';
import { TableEffects } from '../../src/web/effects.ts';
import { TableHud } from '../../src/web/hud.ts';
import { GameSettings } from '../../src/web/settings.ts';
import { TableInteraction } from '../../src/web/interaction-model.ts';
import { decision } from '../../src/core/decision-manager.ts';
import { observe } from '../../src/core/observation-projector.ts';
import { equipmentRowPosition, playerPosition, playerPortraitSize } from '../../src/web/layout.ts';
import { allContent } from '../../src/app/game-content.ts';

// The actual scene, rendering and event handlers run headlessly. Only Phaser's
// browser base and drawing primitives are replaced; production methods are intact.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'phaser' ? 'data:text/javascript,export default { Scene: class {} }' : specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/src/web/table-scene.ts')) return result;
    const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source as Uint8Array).toString();
    return { ...result, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
  },
});
const { TableScene } = await import('../../src/web/table-scene.ts');
hooks.deregister();

export class HudNode {
  children: HudNode[] = [];
  textContent = ''; className = ''; disabled = false; tabIndex = -1; src = ''; alt = '';
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  classes = new Set<string>();
  onclick?: () => void;
  classList = {
    remove: (name: string) => { this.classes.delete(name); },
    add: (name: string) => { this.classes.add(name); },
    toggle: (name: string, enabled: boolean) => { if (enabled) this.classes.add(name); else this.classes.delete(name); },
  };
  append(...children: HudNode[]) { this.children.push(...children); }
  replaceChildren(...children: HudNode[]) { this.children = children; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  click() { assert.equal(this.disabled, false, this.textContent); this.onclick?.(); }
}

export interface Drawing {
  x: number; y: number; width: number; height: number; depth: number; alpha: number;
  text: string; visible: boolean; destroyed: boolean; interactive: boolean;
  children: Drawing[];
  handlers: Map<string, (input: typeof pointer) => void>;
  emit(event: string): void;
  destroy(): void;
  [key: string]: unknown;
}
const pointer = { leftButtonReleased: () => true, getDistance: () => 0 };
function drawing(x = 0, y = 0, width = 0, height = 0, text = ''): Drawing {
  const value = { x, y, width, height, text, depth: 0, alpha: 1, visible: true, destroyed: false,
    interactive: false, children: [] as Drawing[], handlers: new Map() };
  let proxy: Drawing;
  const methods: Record<string, (...args: any[]) => unknown> = {
    setPosition: (x: number, y: number) => { value.x = x; value.y = y; return proxy; },
    setSize: (w: number, h: number) => { value.width = w; value.height = h; return proxy; },
    setDisplaySize: (w: number, h: number) => methods.setSize(w, h),
    setText: (text: string) => { value.text = text; return proxy; },
    setDepth: (depth: number) => { value.depth = depth; return proxy; },
    setAlpha: (alpha: number) => { value.alpha = alpha; return proxy; },
    setVisible: (visible: boolean) => { value.visible = visible; return proxy; },
    setInteractive: () => { value.interactive = true; return proxy; },
    on: (event: string, handler: (input: typeof pointer) => void) => { value.handlers.set(event, handler); return proxy; },
    emit: (event: string) => { assert.equal(value.destroyed, false); value.handlers.get(event)?.(pointer); },
    add: (children: Drawing | Drawing[]) => { value.children.push(...(Array.isArray(children) ? children : [children])); return proxy; },
    destroy: () => { value.destroyed = true; for (const child of value.children) child.destroy(); },
  };
  proxy = new Proxy(value, { get: (target, key) => key in target ? Reflect.get(target, key) :
    methods[String(key)] ?? (() => proxy) }) as unknown as Drawing;
  return proxy;
}

interface SceneHarness {
  model: TableInteraction | null;
  cards: { card: Card; view: Drawing; home: { x: number; y: number } }[];
  judgeMarkers: Map<number, Drawing>;
  objects: Drawing[];
  busy: boolean;
  add: Record<string, unknown>;
  input: unknown;
  textures: unknown;
  tweens: unknown;
  hud: TableHud;
  effects: TableEffects;
  highlights: Drawing;
  arrow: Drawing;
  redraw(obs: ReturnType<typeof observe>): void;
  submit(choice: ActionChoice): Promise<void>;
  updateSelection(): void;
}

export function tableSceneFixture(initial: GameState, self = decision(initial)?.actor ?? 0) {
  let state = initial;
  const nodes = new Map<string, HudNode>();
  const node = (id: string) => { if (!nodes.has(id)) nodes.set(id, new HudNode()); return nodes.get(id)!; };
  const previousDocument = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: node, createElement: () => new HudNode() } });
  const assets = new TableAssets({ cards: {}, generals: {}, generalAudio: {}, cardAudio: {}, systemAudio: {} });
  const session = { get observation() { return observe(state, self); }, get decision() { return decision(state); },
    mode: state.mode.id, humanSeat: self } as unknown as BrowserSession;
  const audio = { muted: true, stopEffect() {} } as GameAudio;
  const scene = new TableScene(session, assets, audio,
    new GameSettings({ getItem: () => null, setItem: () => {} }));
  const view = scene as unknown as SceneHarness;
  const drawings: Drawing[] = [];
  const draw = (x?: number, y?: number, width?: number, height?: number, text?: string) => {
    const item = drawing(x, y, width, height, text); drawings.push(item); return item;
  };
  view.add = { container: draw, rectangle: draw, triangle: draw, image: draw,
    graphics: () => draw(), text: (x: number, y: number, label: string, style: { fontSize?: string }) =>
      draw(x, y, 28, Number.parseFloat(style.fontSize ?? '24') * label.split('\n').length, label) };
  view.textures = { exists: () => false };
  view.tweens = { killTweensOf() {}, add: (config: { onComplete?: () => void }) => config.onComplete?.() };
  view.input = { dragDistanceThreshold: 9, setDraggable() {} };
  view.busy = false;
  view.highlights = draw(); view.arrow = draw();
  view.hud = new TableHud(); view.effects = new TableEffects(scene, assets, audio);
  const submitted: ActionChoice[] = [];
  view.submit = async (choice: ActionChoice) => { submitted.push(choice); };
  const load = (next: GameState) => {
    state = next;
    const obs = session.observation, prompt = session.decision;
    view.model = prompt?.actor === self ? new TableInteraction(prompt, obs.self.hand) : null;
    view.redraw(obs);
  };
  load(state);
  const clickCard = (id: number) => {
    const sprite = view.cards.find(item => item.card.id === id);
    assert.ok(sprite, `界面没有绘制费用牌 ${id}：${decision(state)?.kind}`);
    sprite.view.emit('pointerup');
  };
  const clickTarget = (id: number) => {
    const obs = session.observation, seats = [obs.self, ...obs.others].map(player => player.id);
    const pos = playerPosition(id, seats, self), size = playerPortraitSize(id, seats, self);
    const hit = view.objects.find(item => item.interactive && item.depth === 1 &&
      item.x === pos.x && item.y === pos.y && item.width === size.width && item.height === size.height);
    assert.ok(hit, `界面没有绘制目标 ${id}`);
    hit.emit('pointerup');
  };
  const clickEquipment = (owner: number, id: number) => {
    const obs = session.observation, players = [obs.self, ...obs.others];
    const equipment = Object.values(players.find(player => player.id === owner)!.equip).filter((card): card is Card => Boolean(card));
    const pos = equipmentRowPosition(owner, players.map(player => player.id), self, equipment.findIndex(card => card.id === id), equipment.length);
    const chip = view.objects.find(item => item.interactive && item.depth === 9 && item.x === pos.x && item.y === pos.y);
    assert.ok(chip); chip.emit('pointerup');
  };
  const clickSkill = (id: string) => {
    const skill = allContent.skills().find(skill => skill.id === id || skill.transformations?.some(transform => transform.id === id));
    const tile = node('skill-actions').children.map(wrapper => wrapper.children[0]).find(button => button.dataset.skill === skill?.id);
    assert.ok(tile, `技能铭牌缺失：${id}`); tile.click();
  };
  const dispose = () => { view.effects.dispose(); view.hud.dispose(); Object.assign(globalThis, { document: previousDocument }); };
  return { scene: view, node, submitted, load, clickCard, clickTarget, clickEquipment, clickSkill, drawings, dispose };
}
