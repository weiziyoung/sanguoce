import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import { AutoregressiveChoiceSet } from './autoregressive-choice.ts';
import { forcedActionId } from '../domain/forced-choice.ts';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

export class ModelOutputError extends Error {}

export interface DeepSeekResponseInfo {
  model?: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  choice: string;
  optionId: string;
}
export interface DeepSeekExchange {
  requestedAt: string;
  elapsedMs: number;
  request: AutoregressiveChoiceSet['request'];
  response: unknown;
}
export interface DeepSeekPolicyOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  onResponse?: (info: DeepSeekResponseInfo) => void;
  onExchange?: (exchange: DeepSeekExchange) => void;
}

/** Sends only the acting player's public view and legal actions to DeepSeek. */
export class DeepSeekPolicy implements DecisionPolicy {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly onResponse?: (info: DeepSeekResponseInfo) => void;
  private readonly onExchange?: (exchange: DeepSeekExchange) => void;

  constructor(options: DeepSeekPolicyOptions = {}) {
    this.apiKey = (options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '').trim();
    if (!this.apiKey) throw new Error('缺少 DEEPSEEK_API_KEY');
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.onResponse = options.onResponse;
    this.onExchange = options.onExchange;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('DeepSeek 超时时间必须为正数');
  }

  async choose(observation: Observation, decision: Decision): Promise<string> {
    const forced = forcedActionId(decision);
    if (forced !== null) return forced;
    const choices = new AutoregressiveChoiceSet(observation, decision);
    for (let attempt = 0; attempt < 3; attempt++) {
      const requestedAt = new Date().toISOString();
      const start = Date.now();
      const response = await this.fetcher(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(choices.request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        if (RETRYABLE.has(response.status) && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
          continue;
        }
        if (response.status === 401) throw new Error('DeepSeek 认证失败（HTTP 401）');
        throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`);
      }
      let data: unknown;
      try { data = await response.json(); }
      catch {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(`DeepSeek 连续 3 次返回非 JSON 响应（HTTP ${response.status}）`);
      }
      this.onExchange?.({ requestedAt, elapsedMs: Date.now() - start,
        request: choices.request, response: data });
      const diagnostic = data as { choices?: { finish_reason?: string; message?: { content?: string | null } }[];
        usage?: { completion_tokens?: number } };
      if (diagnostic.choices?.[0]?.finish_reason !== 'stop') {
        throw new ModelOutputError(`DeepSeek 未正常结束：${diagnostic.choices?.[0]?.finish_reason ?? 'unknown'}；` +
          `输出 ${diagnostic.usage?.completion_tokens ?? '?'} tokens；` +
          `正文 ${diagnostic.choices?.[0]?.message?.content?.length ?? 0} 字符`);
      }
      let optionId: string;
      try { optionId = choices.resolveResponse(data); }
      catch (error) { throw new ModelOutputError(`DeepSeek 回答无效：${String(error)}`); }
      const body = data as { model?: string; choices: { message: { content: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number } } };
      this.onResponse?.({ model: body.model, optionId, choice: body.choices[0].message.content.trim(),
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
        reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? 0 });
      return optionId;
    }
    throw new Error('DeepSeek 请求未完成');
  }
}
