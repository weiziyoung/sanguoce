import type { StandardGeneralModule } from './general-module.ts';

export class LvMengGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.lvmeng', label: '吕蒙', sex: 'male', group: 'wu', hp: 4,
    abilities: ['standard.keji'] } as const;
  readonly skills = [{ id: 'standard.keji', label: '克己', modifier: {
    skipDiscard: (state, owner) => state.active === owner && !state.shaPlayedOrRespondedInPlay,
  } }] satisfies StandardGeneralModule['skills'];
}
