import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_POLICY_VERSION } from '../src/policies/rule-policy-version.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const policies = resolve(root, 'src/policies');
const destination = resolve(policies, 'versions', RULE_POLICY_VERSION);
if (existsSync(destination)) throw new Error(`${RULE_POLICY_VERSION} 快照已存在，禁止覆盖`);
const files: string[] = [];
const pending = [resolve(policies, 'strategic-policy.ts')];
const extra = new Set([resolve(root, 'card-ai-profile.ts'), resolve(root, 'src/domain/action-intent.ts')]);
while (pending.length) {
  const source = pending.pop()!;
  if (files.includes(source)) continue;
  files.push(source);
  for (const match of readFileSync(source, 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const dependency = resolve(dirname(source), match[1]);
    if ((dependency.startsWith(policies + '/') && !dependency.startsWith(resolve(policies, 'versions') + '/')) ||
      extra.has(dependency)) pending.push(dependency);
  }
}
const destinations = new Map(files.map(source => [source, resolve(destination,
  source.startsWith(policies + '/') ? relative(policies, source) : source.endsWith('card-ai-profile.ts') ?
    'card-ai-profile.ts' : 'action-intent.ts')]));
const entries = files.map(source => {
  const output = destinations.get(source)!;
  const content = readFileSync(source, 'utf8').replace(/(from\s+['"])(\.[^'"]+)(['"])/g,
    (_match, before: string, specifier: string, after: string) => {
      const dependency = resolve(dirname(source), specifier);
      const path = relative(dirname(output), destinations.get(dependency) ?? dependency);
      return before + (path.startsWith('.') ? path : './' + path) + after;
    });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
  return { source: relative(root, source), file: relative(destination, output),
    sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
    sha256: createHash('sha256').update(content).digest('hex') };
});
writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify({ version: RULE_POLICY_VERSION,
  createdAt: new Date().toISOString(), scope: 'Rule AI source; engine and card catalog remain shared.',
  files: entries }, null, 2) + '\n');
process.stdout.write(`已冻结 ${RULE_POLICY_VERSION}：${entries.length} 个文件\n`);
