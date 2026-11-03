import zhCN from './ui-strings.zh-CN.json';

const primary = zhCN as Record<string, string>;

/**
 * Stable keys, optional values: a future en file can fill the same keys.
 * A missing translation falls back to the key instead of crashing the game.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const value = primary[key] ?? key;

  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const replacement = vars?.[name];
    return replacement === undefined ? match : String(replacement);
  });
}
