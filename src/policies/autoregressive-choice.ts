import type { Decision, Observation } from '../../contracts.ts';
import { ChineseView, type LocalizedChoiceSet } from '../../chinese-view.ts';

export type ChatMessage = { role: 'system' | 'user'; content: string };

export function buildAutoregressiveMessages(
  state: string, instructions: string, criteria: Record<string, string>,
): ChatMessage[] {
  const options = Object.entries(criteria);
  if (!options.length) throw new Error('没有合法行动');
  return [
    {
      role: 'system',
      content: [
        instructions,
        '当前局面和合法行动由游戏引擎提供。只从列出的方案中选择一项。',
        '这是逐步决策。请简短思考，不要逐一推演所有未来分支；尽快给出方案编号。',
        '整条回复只输出方案编号，例如：方案二。不要输出解释、概率或其他文字。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `${state}\n\n【当前合法行动】\n${options.map(([key, label]) => `${key}：${label}`).join('\n')}`,
    },
  ];
}

/** DeepSeek Chat Completions request preview; no API call is made here. */
export function buildDeepSeekFlashRequest(
  state: string, instructions: string, criteria: Record<string, string>,
) {
  return {
    model: 'deepseek-flash',
    messages: buildAutoregressiveMessages(state, instructions, criteria),
    thinking: { type: 'enabled' },
    reasoning_effort: 'low',
    max_tokens: 8192,
    stream: false,
  } as const;
}

/** Extract only the final answer; never treat reasoning text or a mentioned option as a selection. */
export function extractAutoregressiveChoice(response: unknown, criteria: Record<string, string>): string {
  if (!response || typeof response !== 'object' || !('choices' in response) ||
      !Array.isArray(response.choices) || response.choices.length !== 1) {
    throw new Error('模型响应缺少唯一的回答');
  }
  const answer = response.choices[0];
  if (!answer || typeof answer !== 'object' || answer.finish_reason !== 'stop') {
    throw new Error('模型回答未正常结束');
  }
  const content = answer.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有输出方案编号');
  const raw = content.trim();
  let key = raw;
  if (raw.startsWith('{')) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('模型输出的 JSON 格式错误'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        Object.keys(parsed).length !== 1 || !('choice' in parsed) || typeof parsed.choice !== 'string') {
      throw new Error('模型输出的 JSON 必须只有 choice 字段');
    }
    key = parsed.choice;
  }
  if (!Object.hasOwn(criteria, key)) throw new Error('模型输出的方案编号不在当前合法行动中');
  return key;
}

export class AutoregressiveChoiceSet {
  readonly localized: LocalizedChoiceSet;
  readonly request: ReturnType<typeof buildDeepSeekFlashRequest>;

  constructor(observation: Observation, decision: Decision, view = new ChineseView()) {
    this.localized = view.choiceSet(observation, decision);
    const input = this.localized.request(); // Reuse the existing public-view and identifier checks.
    this.request = buildDeepSeekFlashRequest(
      input.state, input.questions.本步行动.instructions, input.questions.本步行动.criteria);
  }

  resolveResponse(response: unknown): string {
    const key = extractAutoregressiveChoice(response, this.localized.criteria);
    return this.localized.resolve(key).id;
  }
}
