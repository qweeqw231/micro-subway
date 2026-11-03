import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n';

const DICTIONARY_PATH = join(process.cwd(), 'src/i18n/ui-strings.zh-CN.json');
const SOURCE_ROOT = join(process.cwd(), 'src');
const CJK = /[\u3400-\u9fff]/;

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return collectSourceFiles(path);
    }
    if (!/\.(ts|tsx)$/.test(entry)) {
      return [];
    }
    return [path];
  });
}

describe('i18n constraints', () => {
  it('has no CJK literals in any source code file', () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(SOURCE_ROOT)) {
      if (file.includes(`${join('src', 'i18n')}`) && file.endsWith('.json')) {
        continue;
      }
      const contents = readFileSync(file, 'utf8');
      if (CJK.test(contents)) {
        offenders.push(file.replace(`${process.cwd()}/`, ''));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has every literal t() key in the dictionary', () => {
    const dictionary = JSON.parse(readFileSync(DICTIONARY_PATH, 'utf8')) as Record<
      string,
      string
    >;
    const missing: string[] = [];

    for (const file of collectSourceFiles(SOURCE_ROOT)) {
      const contents = readFileSync(file, 'utf8');
      const matches = [...contents.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)];
      for (const match of matches) {
        const key = match[1];
        if (!dictionary[key]) {
          missing.push(`${file}: ${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('falls back to the key when a value is missing', () => {
    expect(t('missing.key')).toBe('missing.key');
  });
});
