import { GameEngine } from '../../engine.ts';
import { aiConfiguration, modelPolicy } from './ai-controller.ts';
import type { GamePreferences, GameSettings } from './settings.ts';

/** Separate protocol fields keep Jev and Chat endpoints, models and credentials independent. */
export class AiSettingsPanel {
  constructor(settings: GameSettings, fetcher: typeof fetch = fetch) {
    const input = (key: keyof GamePreferences) => document.getElementById(`setting-${key}`) as HTMLInputElement;
    const status = document.getElementById('settings-ai-status')!;
    const test = document.getElementById('settings-test-ai') as HTMLButtonElement;
    const fields = ['jevEndpoint', 'jevModel', 'jevApiKey', 'chatEndpoint', 'chatModel', 'chatApiKey'] as const;
    input('aiProvider').addEventListener('change', () => settings.update({ aiProvider: input('aiProvider').value as GamePreferences['aiProvider'] }));
    for (const key of fields) input(key).addEventListener('change', () => settings.update({ [key]: input(key).value }));
    let active: AbortController | null = null;
    let configuration = aiConfiguration(settings.value);
    settings.subscribe(() => {
      const value = settings.value;
      const next = aiConfiguration(value);
      if (configuration !== next) {
        active?.abort(); active = null;
        status.textContent = '';
      }
      configuration = next;
      input('aiProvider').value = value.aiProvider;
      for (const key of fields) input(key).value = value[key];
      for (const provider of ['jev', 'chat'] as const)
        document.getElementById(`ai-fields-${provider}`)!.classList.toggle('hidden', value.aiProvider !== provider);
      test.disabled = value.aiProvider === 'rule' || active !== null;
      document.getElementById('settings-credentials-status')!.textContent = settings.credentialsPersistent
        ? 'API Key 仅保存在当前标签页，关闭标签页后清除。' : 'API Key 仅保存在当前页面，刷新后需重新填写。';
    });
    test.onclick = () => {
      if (active || settings.value.aiProvider === 'rule') return;
      const controller = new AbortController();
      active = controller;
      test.disabled = true;
      status.textContent = '正在请求示例决策…';
      const startedAt = performance.now();
      void (async () => {
        try {
          const game = GameEngine.standard({ seed: 1 });
          const decision = game.getDecision()!;
          const optionId = await modelPolicy(settings.value, fetcher, controller.signal).choose(game.getObservation(decision.actor), decision);
          game.choose({ decisionId: decision.id!, optionId });
          if (active === controller) status.textContent = `连接成功，返回合法行动 · ${Math.round(performance.now() - startedAt)} ms`;
        } catch (error) {
          if (active === controller) status.textContent = error instanceof TypeError
            ? '连接失败，请检查请求地址、网络及接口的跨域访问（CORS）配置。'
            : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? '请求超时，请重试。'
            : error instanceof Error ? error.message : 'AI 连接失败';
        } finally {
          if (active === controller) { active = null; test.disabled = settings.value.aiProvider === 'rule'; }
        }
      })();
    };
    document.getElementById('settings-dialog')!.addEventListener('close', () => {
      active?.abort(); active = null;
      test.disabled = settings.value.aiProvider === 'rule';
      status.textContent = '';
    });
  }
}
