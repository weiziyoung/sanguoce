import type { StandardGeneralModule } from './general-module.ts';

export class ZhangFeiGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.zhangfei', label: '张飞', sex: 'male', group: 'shu', hp: 4,
    abilities: ['standard.paoxiao'] } as const;
  readonly skills = [{ id: 'standard.paoxiao', label: '咆哮', modifier: {
    shaLimit: () => Infinity,
  } }] satisfies StandardGeneralModule['skills'];
}
