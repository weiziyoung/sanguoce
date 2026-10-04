import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import { ChineseView } from '../../chinese-view.ts';
import { forcedActionId } from '../domain/forced-choice.ts';

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const RETRYABLE_STATUS = new Set([429, 529]);

export interface JevPolicyOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** Calls Jev with the acting player's public view and returns one legal leaf action ID. */
export class JevPolicy implements DecisionPolicy {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly view = new ChineseView();

  constructor(options: JevPolicyOptions = {}) {
    this.apiKey = (options.apiKey ?? process.env.JEV_API_KEY ?? '').trim();
    if (!this.apiKey) throw new Error('缺少 JEV_API_KEY；请设置环境变量或使用本地 .env.local');
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('Jev 超时时间必须为正数');
  }

  async choose(observation: Observation, decision: Decision): Promise<string> {
    const forced = forcedActionId(decision);
    if (forced !== null) return forced;
    const choices = this.view.choiceSet(observation, decision);
    const body = JSON.stringify(choices.request());
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.fetcher(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.ok) {
        let result: unknown;
        try { result = await response.json(); }
        catch { throw new Error('Jev 返回了非 JSON 响应'); }
        return choices.resolveResponse(result);
      }
      if (RETRYABLE_STATUS.has(response.status) && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
        continue;
      }
      if (response.status === 401) throw new Error('Jev 认证失败（HTTP 401），请检查 JEV_API_KEY');
      throw new Error(`Jev 请求失败（HTTP ${response.status}）`);
    }
    throw new Error('Jev 请求未完成');
  }
}
