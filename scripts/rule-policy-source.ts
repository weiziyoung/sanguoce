import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const policies = resolve(root, 'src/policies');
const shared = new Set([resolve(root, 'card-ai-profile.ts'), resolve(root, 'src/domain/action-intent.ts'),
  resolve(root, 'src/domain/public-interactions.ts')]);
const sources = new Map<string, string>();
const pending = [resolve(policies, 'strategic-policy.ts')];
while (pending.length) {
  const path = pending.pop()!;
  if (sources.has(path)) continue;
  const source = readFileSync(path, 'utf8');
  sources.set(path, source);
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const dependency = resolve(dirname(path), match[1]);
    if (dependency.startsWith(policies + '/') || shared.has(dependency)) pending.push(dependency);
  }
}
const digest = createHash('sha256');
for (const [path, source] of [...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
  digest.update(relative(root, path)).update('\0').update(source).update('\0');
}
/** Report/resume identity for the current source, without numbering or copying policies. */
export const rulePolicyBaseline = `StrategicPolicy sha256:${digest.digest('hex')}`;
