import { existsSync } from 'node:fs';
import type { StrategicPolicy } from '../../src/policies/strategic-policy.ts';

/** Private historical snapshots are optional in public source checkouts. */
export async function archivedPolicy(version: string): Promise<(new () => StrategicPolicy) | null> {
  if (!/^v\d+$/.test(version)) throw new Error('Invalid archived policy version');
  const file = new URL(`../../src/policies/versions/${version}/strategic-policy.ts`, import.meta.url);
  return existsSync(file) ? (await import(file.href)).StrategicPolicy : null;
}
