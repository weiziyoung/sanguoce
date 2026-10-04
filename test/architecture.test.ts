import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

test('依赖边界：共用内核不导入具体模式或牌包，模式不直接操作牌区', () => {
  const boundaries = [
    { directory: 'src/core', forbidden: ['src/app/', 'src/content/', 'src/modes/'] },
    { directory: 'src/rules', forbidden: ['src/app/', 'src/content/', 'src/modes/'] },
    { directory: 'src/modes', forbidden: ['src/app/', 'src/content/', 'src/core/', 'src/rules/operations/'] },
    { directory: 'src/content', forbidden: ['src/app/', 'src/modes/'] },
  ];
  for (const { directory, forbidden } of boundaries) {
    for (const file of files(join(root, directory))) {
      for (const dependency of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
        const target = relative(root, resolve(dirname(file), dependency.fileName));
        assert.ok(!forbidden.some(prefix => target.startsWith(prefix)), `${relative(root, file)} 不能依赖 ${target}`);
        assert.ok(!['cli.ts', 'policy.ts', 'rule-base-policy.ts', 'terminal-view.ts', 'trace.ts'].includes(target),
          `${relative(root, file)} 不能依赖 UI、策略或存储适配 ${target}`);
      }
    }
  }
});
