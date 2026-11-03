import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n';

const DICTIONARY_PATH = join(process.cwd(), 'src/i18n/ui-strings.zh-CN.json');
const SCAN_DIRS = ['src/ui', 'src/render', 'src/app'];
const CJK = /[\u3400-\u9fff]/;

function collectFiles(dir: string): string[] {
  const fullPath = join(process.cwd(), dir);
  const entries = readdirSync(fullPath);

  return entries.flatMap((entry) => {
    const path = join(fullPath, entry);
    if (statSync(path).isDirectory()) {
      return collectFiles(join(dir, entry));
    }
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('i18n constraints', () => {
  it('has no CJK literals in UI, render, or app code', () => {
    const offenders: string[] = [];

    for (const file of SCAN_DIRS.flatMap(collectFiles)) {
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

    for (const file of SCAN_DIRS.flatMap(collectFiles)) {
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

  it('throws when a key is missing', () => {
    expect(() => t('missing.key')).toThrow('Missing UI string key');
  });
});
