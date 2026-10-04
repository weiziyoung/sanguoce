import type { GeneralCandidate } from '../app/duel-general-selector.ts';
import { GAME_NAME } from './brand.ts';

const groups = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' } as const;

/** A pregame screen is independent of game observations and card decisions. */
export function renderGeneralSelection(candidates: readonly GeneralCandidate[], seed: number, message = '',
  identity?: { role: string; lord: string }): string {
  const lines = [
    `${GAME_NAME} ${identity ? '标准五人身份局' : '1v1'} · 选将 · 随机种子 ${seed}`,
    ...(identity ? [`你的身份：${identity.role}；主公：${identity.lord}`] : []),
    `从以下${candidates.length === 3 ? '三' : candidates.length === 5 ? '五' : candidates.length}名武将中选一名：`,
    ...candidates.flatMap((general, index) => [
      `  ${index + 1}. ${general.label}  ${groups[general.group]} · ${general.hp} 点体力`,
      `     技能：${general.skills.join('、') || '无'}`,
    ]),
    `输入 1 至 ${candidates.length} 选将；输入 q 退出。`,
  ];
  if (message) lines.push(message);
  return lines.join('\n');
}
