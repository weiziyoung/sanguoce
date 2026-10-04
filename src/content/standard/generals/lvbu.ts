import type { StandardGeneralModule } from './general-module.ts';

export class LvBuGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.lvbu', label: '吕布', sex: 'male', group: 'qun', hp: 4,
    abilities: ['standard.wushuang'] } as const;
  readonly skills = [{ id: 'standard.wushuang', label: '无双', modifier: {
    responseCount: (_state, owner, source, _target, mode, current) =>
      owner === source && (mode === 'sha' || mode === 'juedou') ? current + 1 : current,
  } }] satisfies StandardGeneralModule['skills'];
}
