import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import { forcedActionId } from '../domain/forced-choice.ts';
import { AutoregressiveChoiceSet } from './autoregressive-choice.ts';
import { modelEndpoint } from './model-endpoint.ts';

export interface ChatCompletionsOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** Chat Completions protocol; reuse public-view prompts and strict choice parsing. */
export class ChatCompletionsPolicy implements DecisionPolicy {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: ChatCompletionsOptions) {
    this.endpoint = modelEndpoint(options.endpoint);
    this.model = options.model.trim();
    if (!this.model) throw new Error('请填写 Chat 模型名');
    this.apiKey = options.apiKey?.trim() ?? '';
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('Chat 超时时间必须为正数');
  }
  async choose(observation: Observation, decision: Decision): Promise<string> {
    const forced = forcedActionId(decision);
    if (forced !== null) return forced;
    const choices = new AutoregressiveChoiceSet(observation, decision);
    const response = await this.fetcher(this.endpoint, {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      // Token limits and reasoning flags vary by provider; leave those at service defaults.
      body: JSON.stringify({ model: this.model, messages: choices.request.messages, stream: false }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Chat 请求失败（HTTP ${response.status}）`);
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new Error('Chat 返回了非 JSON 响应'); }
    return choices.resolveResponse(data);
  }
}
