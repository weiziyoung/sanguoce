import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import { ChineseView } from '../../chinese-view.ts';
import { forcedActionId } from '../domain/forced-choice.ts';

const LOCAL_ENDPOINT = 'http://127.0.0.1:8000/v1/systemone';
const LAYA_MAX_HTTP_CHOICES = 100;

export interface LayaPolicyOptions {
  endpoint?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** Uses the local Laya multilingual checkpoint through its Jev-compatible HTTP API. */
export class LayaPolicy implements DecisionPolicy {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly view = new ChineseView();

  constructor(options: LayaPolicyOptions = {}) {
    this.endpoint = options.endpoint ?? LOCAL_ENDPOINT;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('Laya 超时时间必须为正数');
  }

  async choose(observation: Observation, decision: Decision): Promise<string> {
    const forced = forcedActionId(decision);
    if (forced !== null) return forced;
    const choices = this.view.choiceSet(observation, decision);
    if (choices.map.size > LAYA_MAX_HTTP_CHOICES) {
      throw new Error(`合法行动有${choices.map.size}项，超过 Laya HTTP 服务的${LAYA_MAX_HTTP_CHOICES}项上限`);
    }
    const request = { ...choices.request(), model: 'multilingual' };
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Laya 请求失败（HTTP ${response.status}）`);
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new Error('Laya 返回了非 JSON 响应'); }
    return choices.resolveResponse(result);
  }
}
