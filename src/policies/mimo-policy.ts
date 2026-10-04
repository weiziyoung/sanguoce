import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import { AutoregressiveChoiceSet } from './autoregressive-choice.ts';
import { forcedActionId } from '../domain/forced-choice.ts';

const ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

export class MimoOutputError extends Error {}

export type MimoModel = 'mimo-v2.6-flash' | 'mimo-v2.6-pro';

export function buildMimoRequest(messages: AutoregressiveChoiceSet['request']['messages'], model: MimoModel = 'mimo-v2.6-flash') {
  return {
    model,
    messages,
    thinking: { type: 'enabled' },
    max_completion_tokens: 8192,
    stream: false,
  } as const;
}

export interface MimoResponseInfo {
  model?: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  choice: string;
  optionId: string;
}
export interface MimoExchange {
  requestedAt: string;
  elapsedMs: number;
  request: ReturnType<typeof buildMimoRequest>;
  response: unknown;
}
export interface MimoPolicyOptions {
  apiKey?: string;
  model?: MimoModel;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  onResponse?: (info: MimoResponseInfo) => void;
  onExchange?: (exchange: MimoExchange) => void;
}

/** Calls MiMo with the acting player's public view and returns a legal leaf action. */
export class MimoPolicy implements DecisionPolicy {
  private readonly apiKey: string;
  private readonly model: MimoModel;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly onResponse?: (info: MimoResponseInfo) => void;
  private readonly onExchange?: (exchange: MimoExchange) => void;

  constructor(options: MimoPolicyOptions = {}) {
    this.apiKey = (options.apiKey ?? process.env.MIMO_API_KEY ?? '').trim();
    if (!this.apiKey) throw new Error('缺少 MIMO_API_KEY');
    this.model = options.model ?? 'mimo-v2.6-flash';
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.onResponse = options.onResponse;
    this.onExchange = options.onExchange;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('MiMo 超时时间必须为正数');
  }

  async choose(observation: Observation, decision: Decision): Promise<string> {
    const forced = forcedActionId(decision);
    if (forced !== null) return forced;
    const choices = new AutoregressiveChoiceSet(observation, decision);
    const request = buildMimoRequest(choices.request.messages, this.model);
    for (let attempt = 0; attempt < 3; attempt++) {
      const requestedAt = new Date().toISOString();
      const start = Date.now();
      const response = await this.fetcher(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        if (RETRYABLE.has(response.status) && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
          continue;
        }
        if (response.status === 401) throw new Error('MiMo 认证失败（HTTP 401）');
        throw new Error(`MiMo 请求失败（HTTP ${response.status}）`);
      }
      let data: unknown;
      try { data = await response.json(); }
      catch {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(`MiMo 连续 3 次返回非 JSON 响应（HTTP ${response.status}）`);
      }
      this.onExchange?.({ requestedAt, elapsedMs: Date.now() - start, request, response: data });
      const diagnostic = data as { choices?: { finish_reason?: string; message?: { content?: string | null } }[];
        usage?: { completion_tokens?: number } };
      if (diagnostic.choices?.[0]?.finish_reason !== 'stop') {
        throw new MimoOutputError(`MiMo 未正常结束：${diagnostic.choices?.[0]?.finish_reason ?? 'unknown'}；` +
          `输出 ${diagnostic.usage?.completion_tokens ?? '?'} tokens；` +
          `正文 ${diagnostic.choices?.[0]?.message?.content?.length ?? 0} 字符`);
      }
      let optionId: string;
      try { optionId = choices.resolveResponse(data); }
      catch (error) { throw new MimoOutputError(`MiMo 回答无效：${String(error)}`); }
      const body = data as { model?: string; choices: { message: { content: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number } } };
      this.onResponse?.({ model: body.model, optionId, choice: body.choices[0].message.content.trim(),
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
        reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? 0 });
      return optionId;
    }
    throw new Error('MiMo 请求未完成');
  }
}
