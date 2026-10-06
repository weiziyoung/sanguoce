import type { DecisionPolicy } from '../../contracts.ts';
import type { BrowserSession } from '../app/browser-session.ts';
import { forcedActionId } from '../domain/forced-choice.ts';
import { JevPolicy } from '../policies/jev-policy.ts';
import { ChatCompletionsPolicy } from '../policies/chat-completions-policy.ts';
import { JEV_ENDPOINT } from '../policies/model-endpoint.ts';
import type { GamePreferences, GameSettings } from './settings.ts';
import { appUrl } from './deployment.ts';

export function aiConfiguration(value: Readonly<GamePreferences>): string {
  return JSON.stringify(value.aiProvider === 'jev' ? [value.aiProvider, value.jevEndpoint, value.jevModel, value.jevApiKey]
    : value.aiProvider === 'chat' ? [value.aiProvider, value.chatEndpoint, value.chatModel, value.chatApiKey] : ['rule']);
}

export function modelPolicy(value: Readonly<GamePreferences>, fetcher: typeof fetch = fetch,
  signal?: AbortSignal): DecisionPolicy {
  const request: typeof fetch = (url, init) => {
    const destination = String(url) === JEV_ENDPOINT ? appUrl('/api/ai/jev') : url;
    const signals = [init?.signal, signal].filter((value): value is AbortSignal => Boolean(value));
    return fetcher(destination, { ...init, credentials: 'omit', redirect: 'error',
      ...(signals.length ? { signal: AbortSignal.any(signals) } : {}) });
  };
  if (value.aiProvider === 'jev') return new JevPolicy({ endpoint: value.jevEndpoint,
    model: value.jevModel, apiKey: value.jevApiKey, fetcher: request });
  if (value.aiProvider === 'chat') return new ChatCompletionsPolicy({ endpoint: value.chatEndpoint,
    model: value.chatModel, apiKey: value.chatApiKey, fetcher: request });
  throw new Error('规则策略无需连接 API');
}

class ConfigurationChanged extends Error {}

/** One outstanding decision. Cancel changed configurations and preserve the same decision on errors. */
export class AiController {
  private active: AbortController | null = null;
  private disposed = false;
  private unsubscribe: () => void;
  private configuration: string;
  private settings: GameSettings;
  private fetcher: typeof fetch;
  constructor(settings: GameSettings, fetcher: typeof fetch = fetch) {
    this.settings = settings;
    this.fetcher = fetcher;
    this.configuration = aiConfiguration(settings.value);
    this.unsubscribe = settings.subscribe(() => {
      const next = aiConfiguration(settings.value);
      if (next !== this.configuration) this.active?.abort(new ConfigurationChanged());
      this.configuration = next;
    });
  }
  async step(session: BrowserSession, thinking: (label: string) => void = () => {}): Promise<void> {
    while (!this.disposed) {
      await this.settings.whenClosed();
      if (this.disposed) return;
      const value = this.settings.value;
      const expected = aiConfiguration(value);
      const controller = new AbortController();
      this.active = controller;
      try {
        const forced = session.decision && forcedActionId(session.decision);
        const policy = forced ? { choose: () => forced } : value.aiProvider === 'rule' ? undefined : modelPolicy(value, this.fetcher, controller.signal);
        thinking(value.aiProvider === 'chat' ? '电脑思考中 · Chat' : value.aiProvider === 'jev' ? '电脑思考中 · Jev' : '电脑正在行动…');
        await session.computerStep(policy, async () => {
          await this.settings.whenClosed();
          if (this.disposed || controller.signal.aborted) throw controller.signal.reason ?? new ConfigurationChanged();
          if (expected !== aiConfiguration(this.settings.value)) throw new ConfigurationChanged();
        });
        return;
      } catch (error) {
        if (this.disposed) return;
        if (expected !== aiConfiguration(this.settings.value) || error instanceof ConfigurationChanged) continue;
        if (error instanceof TypeError) throw new Error('无法连接 AI API，请检查地址、网络及接口的跨域访问（CORS）配置');
        if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new Error('AI 请求超时，请重试或在设置中切换策略');
        throw error;
      } finally { if (this.active === controller) this.active = null; }
    }
  }
  dispose(): void { this.disposed = true; this.active?.abort(); this.unsubscribe(); }
}
