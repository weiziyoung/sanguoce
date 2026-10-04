import { NAMES, cardText, type Card } from "./catalog.ts";
import type { Choice, Decision, Observation, VisiblePlayer } from "./contracts.ts";
import { STANDARD_SKILL_HELP } from './src/content/standard/skill-help.ts';
import { STANDARD_MODEL_GENERALS, STANDARD_MODEL_SKILL_NAMES } from './src/presentation/standard-model-metadata.ts';

const PHASES: Record<string, string> = {
  setup: "准备", start: "开始", judge: "判定", draw: "摸牌",
  play: "出牌", discard: "弃牌", end: "结束", finished: "对局结束",
};
const SLOTS: Record<string, string> = {
  weapon: "武器", armor: "防具", plusHorse: "防御坐骑", minusHorse: "进攻坐骑",
};
const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const ROLES: Record<string, string> = { lord: '主公', loyalist: '忠臣', rebel: '反贼', renegade: '内奸' };
const GROUPS: Record<string, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
const INTERNAL_IDENTIFIER = new RegExp(
  `\\b(?:${Object.keys(NAMES).join('|')})\\b|\\b[a-z][a-z0-9_-]*\\.[a-z][a-z0-9_.-]*\\b`, 'iu');
const MODEL_QUESTION = '本步行动';
const MAX_MODEL_CHOICES = 255;
export function roleLabel(role?: string): string { return role ? ROLES[role] ?? role : '未知'; }
function modelPlayerName(player: VisiblePlayer): string {
  const general = player.general ? STANDARD_MODEL_GENERALS[player.general] : undefined;
  if (player.general && !general) throw new Error(`武将展示名称缺失：${player.general}`);
  return general && !player.label.includes(general.label)
    ? `${player.label}（${general.label}）` : player.label;
}
function modelPlayerRef(player: VisiblePlayer): string {
  const name = modelPlayerName(player).replace(new RegExp(`^座位${player.id + 1}·`), '');
  return `玩家${player.id + 1}（${name}）`;
}
function modelSkills(player: VisiblePlayer): string {
  const general = player.general ? STANDARD_MODEL_GENERALS[player.general] : undefined;
  if (player.general && !general) throw new Error(`武将技能信息缺失：${player.general}`);
  return (general?.skills ?? []).map(([id, label]) => {
    const description = STANDARD_SKILL_HELP[id];
    if (!description) throw new Error(`技能说明缺失：${label}`);
    return `【${label}】${description.replace(/[。；]+$/u, '')}`;
  }).join('；');
}
function modelEvent(line: string): string {
  return line.replace(/\b(?:standard|pilot)\.[a-z][\w.-]*\b/giu, id => {
    const cardId = id.startsWith('standard.') ? id.slice('standard.'.length) : id;
    const label = (NAMES as Record<string, string>)[cardId] ?? STANDARD_MODEL_SKILL_NAMES[id];
    if (!label) throw new Error(`事件展示名称缺失：${id}`);
    return label;
  });
}
function chineseNumber(number: number): string {
  if (number < 10) return DIGITS[number];
  if (number < 20) return "十" + (number % 10 ? DIGITS[number % 10] : "");
  if (number < 100) return DIGITS[Math.floor(number / 10)] + "十" + (number % 10 ? DIGITS[number % 10] : "");
  return String(number);
}
function cardList(cards: Card[]): string {
  return cards.length ? cards.map((card, index) => `手牌${chineseNumber(index + 1)}${cardText(card)}`).join("、") : "无";
}
function equipment(player: VisiblePlayer): string {
  const equipped = Object.entries(player.equip)
    .filter(([, card]) => card !== null)
    .map(([slot, card]) => `${SLOTS[slot] ?? "装备"}${cardText(card!)}`);
  return equipped.length ? equipped.join("、") : "无";
}
function delayed(player: VisiblePlayer): string {
  return player.judge.length ? player.judge.map(cardText).join("、") : "无";
}
function hearts(player: VisiblePlayer): string {
  return "♥".repeat(Math.max(0, player.hp)) + "♡".repeat(Math.max(0, player.maxHp - player.hp));
}
function cellWidth(character: string): number {
  return /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(character) ? 2 : 1;
}
function width(value: string): number {
  return [...value].reduce((total, character) => total + cellWidth(character), 0);
}
function wrapCharacters(value: string, maximum: number): string[] {
  const lines: string[] = [];
  let current = "";
  let used = 0;
  for (const character of value) {
    const nextWidth = cellWidth(character);
    if (used + nextWidth > maximum && current) {
      lines.push(current);
      current = "";
      used = 0;
    }
    current += character;
    used += nextWidth;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
function wrap(value: string, maximum: number): string[] {
  if (!value.includes("、")) return wrapCharacters(value, maximum);
  const parts = value.split("、");
  const lines: string[] = [];
  let current = parts.shift()!;
  for (const part of parts) {
    const joined = `${current}、${part}`;
    if (width(joined) <= maximum) current = joined;
    else {
      lines.push(current + "、");
      current = "      " + part;
    }
  }
  lines.push(current);
  return lines.flatMap(line => wrapCharacters(line, maximum));
}
function box(sections: string[][]): string {
  const contentWidth = 72;
  const edge = "+" + "-".repeat(contentWidth + 2) + "+";
  const divider = "+" + "-".repeat(contentWidth + 2) + "+";
  const lines = [edge];
  sections.forEach((section, index) => {
    if (index) lines.push(divider);
    for (const item of section) for (const part of wrap(item, contentWidth)) {
      lines.push(`| ${part}${" ".repeat(contentWidth - width(part))} |`);
    }
  });
  lines.push(edge);
  return lines.join("\n");
}

export class ChineseView {
  board(observation: Observation): string {
    const self = observation.self;
    const phase = PHASES[observation.phase];
    if (!phase) throw new Error("阶段中文映射缺失");
    if (observation.mode.id === 'identity') {
      const players = [self, ...observation.others].sort((a, b) => a.id - b.id);
      const compactEquipment = (player: VisiblePlayer) => Object.values(player.equip)
        .filter((card): card is Card => Boolean(card)).map(card => NAMES[card.name] ?? card.name).join('、') || '无';
      const compactJudge = (player: VisiblePlayer) => player.judge.map(card => NAMES[card.name] ?? card.name).join('、') || '无';
      const hand = self.hand.map((card, index) => `${index + 1}${cardText(card)}`).join('、') || '无';
      return box([[
        `五人身份局 · 第 ${observation.turn} 回合 · ${phase}阶段 · 当前座位 ${observation.active + 1}`,
        `牌堆 ${observation.deckCount} 张 · 弃牌堆 ${observation.discardCount} 张`,
        ...players.map(player =>
          `${player.id === self.id ? '你' : '  '}座${player.id + 1} ${player.label}【${roleLabel(player.role)}】` +
          ` ${player.alive ? `${player.hp}/${player.maxHp}血` : '已阵亡'} 手牌${player.handCount}` +
          ` 装备${compactEquipment(player)} 判定${compactJudge(player)}`),
        `你的手牌：${hand}`,
      ]]);
    }
    const other = observation.others[0];
    return box([
      [
        `对手 ${other.label}  ${hearts(other)}  ${other.hp}/${other.maxHp}  手牌 ${other.handCount} 张`,
        `装备：${equipment(other)}`,
        `判定：${delayed(other)}`,
      ],
      [
        `第 ${observation.turn} 回合 · ${phase}阶段`,
        `牌堆 ${observation.deckCount} 张 · 弃牌堆 ${observation.discardCount} 张`,
      ],
      [
        `我方 ${self.label}  ${hearts(self)}  ${self.hp}/${self.maxHp}  手牌 ${self.hand.length} 张`,
        `装备：${equipment(self)}`,
        `判定：${delayed(self)}`,
        `手牌：${cardList(self.hand)}`,
      ],
    ]);
  }

  stateForDecision(observation: Observation, decision: Decision): string {
    const self = observation.self;
    const players = [self, ...observation.others];
    const active = players.find(player => player.id === observation.active);
    if (!active) throw new Error('当前行动者不在可见局面中');
    const named = modelPlayerRef;
    const identity = (player: VisiblePlayer) =>
      `${player.sex === 'female' ? '女' : '男'}` +
      `${player.group ? `，${GROUPS[player.group] ?? player.group}势力` : ''}` +
      `${observation.mode.id === 'identity' ? `【${roleLabel(player.role)}】` : ''}`;
    const skills = players.map(player => {
      const description = modelSkills(player);
      return description ? `${named(player)}的技能：${description}。` : '';
    }).filter(Boolean);
    const others = observation.others.map(other =>
      `- ${named(other)}，${identity(other)}：${other.alive ? `体力${other.hp}/${other.maxHp}` : "已阵亡"}，手牌${other.handCount}张（内容未知），装备${equipment(other)}，判定区${delayed(other)}。`);
    const shown = observation.table.length
      ? `场上亮出的牌：${observation.table.map(cardText).join("、")}。` : "";
    const phase = PHASES[observation.phase];
    if (!phase) throw new Error("阶段中文映射缺失");
    const response = observation.nullify
      ? `当前【${NAMES[observation.nullify.cname] ?? observation.nullify.cardLabel ?? observation.nullify.cname}】的【无懈可击】链已使用${observation.nullify.parity}张。`
      : "";
    // Observation.log is stored oldest-to-newest by the observation projector.
    const recent = observation.log.slice(-6).map((line, index) => `${index + 1}. ${modelEvent(line)}。`);
    return [
      '【当前决策】',
      `${observation.mode.id === 'identity' ? `${players.length}人身份局` : '1v1对决'}；第${observation.turn}回合；${phase}阶段。`,
      `当前行动者：${named(active)}。本次决策：${decision.title}。本回合已使用【杀】${observation.shaUsed}次。`,
      '【当前状态】',
      `- 你：${named(self)}，${identity(self)}，体力${self.hp}/${self.maxHp}，手牌${self.hand.length}张：${cardList(self.hand)}；装备${equipment(self)}；判定区${delayed(self)}。`,
      ...others,
      '【技能说明】',
      ...skills,
      `【牌堆】剩余${observation.deckCount}张；弃牌堆${observation.discardCount}张。`,
      shown, response,
      ...(recent.length ? [
        `【最近公开事件】以下按发生时间从早到晚排列：第1条最早，第${recent.length}条最新。`,
        ...recent,
      ] : []),
    ].filter(Boolean).join("\n");
  }

  choiceSet(observation: Observation, decision: Decision, options: Choice[] = decision.options): LocalizedChoiceSet {
    const self = observation.self;
    const instructions = observation.mode.id === 'duel' && observation.others.length === 1 ?
      `你是${modelPlayerRef(self)}，你的目标是杀死${modelPlayerRef(observation.others[0])}取得胜利。请从当前合法行动中选出最有利的一项。` :
      `你是${modelPlayerRef(self)}，请以满足当前身份的胜利条件为目标，从当前合法行动中选出最有利的一项。`;
    return new LocalizedChoiceSet(this.stateForDecision(observation, decision), options, instructions);
  }
}

function choiceLeaves(options: Choice[], path: string[] = []): { choice: Choice; label: string }[] {
  return options.flatMap(option => {
    const nextPath = [...path, option.label];
    return option.children ? choiceLeaves(option.children, nextPath) :
      [{ choice: option, label: nextPath.join(' → ') }];
  });
}

/** 将规则引擎的完整合法动作展开；中文键与内部叶子 ID 的对应只保存在本地。 */
export class LocalizedChoiceSet {
  readonly state: string;
  readonly options: Choice[];
  readonly map = new Map<string, Choice>();
  readonly criteria: Record<string, string>;
  readonly instructions: string;
  constructor(state: string, options: Choice[], instructions = '请从当前合法行动中选出最有利的一项。') {
    this.state = state;
    this.options = options;
    this.instructions = instructions;
    const leaves = choiceLeaves(options);
    if (!leaves.length) throw new Error('没有合法行动');
    if (leaves.length > MAX_MODEL_CHOICES) {
      throw new Error(`合法行动有${leaves.length}项，超过 Jev Choice 的${MAX_MODEL_CHOICES}项上限`);
    }
    if (new Set(leaves.map(({ choice }) => choice.id)).size !== leaves.length) {
      throw new Error('合法行动包含重复的叶子 ID');
    }
    this.criteria = Object.fromEntries(leaves.map(({ choice, label }, index) => {
      const key = `方案${chineseNumber(index + 1)}`;
      this.map.set(key, choice);
      return [key, label];
    }));
  }
  request() {
    for (const content of [this.state, this.instructions, ...Object.values(this.criteria)]) {
      const internal = content.match(INTERNAL_IDENTIFIER)?.[0];
      if (internal) throw new Error(`模型请求包含内部标识：${internal}`);
    }
    return {
      model: "jev-latest",
      state: this.state,
      questions: {
        [MODEL_QUESTION]: {
          type: "choice" as const,
          instructions: this.instructions,
          criteria: this.criteria,
        },
      },
    };
  }
  resolve(key: string): Choice {
    const selected = this.map.get(key);
    if (!selected) throw new Error("模型返回了非法候选");
    return selected;
  }
  resolveResponse(response: unknown): string {
    if (!response || typeof response !== 'object' || !('answers' in response)) {
      throw new Error('模型响应缺少行动答案');
    }
    const answers = response.answers;
    if (!answers || typeof answers !== 'object' || !(MODEL_QUESTION in answers)) {
      throw new Error('模型响应缺少行动答案');
    }
    const answer = answers[MODEL_QUESTION as keyof typeof answers];
    if (!answer || typeof answer !== 'object' || !('choice' in answer) ||
      typeof answer.choice !== 'string') {
      throw new Error('模型响应的行动答案格式错误');
    }
    return this.resolve(answer.choice).id;
  }
}
