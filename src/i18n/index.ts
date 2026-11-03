import rawStrings from './ui-strings.zh-CN.json';

const strings = rawStrings as Record<string, string>;

export function t(key: string, vars?: Record<string, string | number>): string {
  const value = strings[key];
  if (!value) {
    throw new Error(`Missing UI string key: ${key}`);
  }

  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const replacement = vars?.[name];
    return replacement === undefined ? match : String(replacement);
  });
}
