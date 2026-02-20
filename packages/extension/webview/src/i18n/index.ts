import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

const resources = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

export type SupportedLanguage = keyof typeof resources;
export type UiLanguage = 'auto' | SupportedLanguage;

// VS Code display language -> supported language mapping
const languageMap: Record<string, SupportedLanguage> = {
  en: 'en-US',
  'en-us': 'en-US',
  'en-gb': 'en-US',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  zh: 'zh-CN',
};

function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function format(str: string, args: unknown[] | Record<string, unknown>): string {
  if (Array.isArray(args)) {
    return str.replace(/{(\d+)}/g, (match, number) => {
      const idx = Number(number);
      return typeof args[idx] !== 'undefined' ? String(args[idx]) : match;
    });
  }

  return str.replace(/{(\w+)}/g, (match, key) => {
    return typeof args[key] !== 'undefined' ? String(args[key]) : match;
  });
}

export function resolveLanguage(vscodeDisplayLanguage: string | undefined, uiLanguage: UiLanguage): SupportedLanguage {
  if (uiLanguage !== 'auto') return uiLanguage;
  const normalized = (vscodeDisplayLanguage || '').toLowerCase();
  return languageMap[normalized] ?? 'en-US';
}

export default class I18n {
  private static language: SupportedLanguage = 'en-US';
  private static resource: Record<string, unknown> = resources['en-US'];

  private constructor() {}

  static init(language: SupportedLanguage): void {
    I18n.language = language;
    I18n.resource = resources[language] ?? resources['en-US'];
  }

  static getCurrentLanguage(): SupportedLanguage {
    return I18n.language;
  }

  static t(key: string, ...args: unknown[]): string {
    const raw = getByPath(I18n.resource, key);
    const text = typeof raw === 'string' ? raw : key;

    if (args.length === 0) return text;
    // Single array argument → treat as positional parameters
    if (args.length === 1 && Array.isArray(args[0])) {
      return format(text, args[0] as unknown[]);
    }
    // Single object argument → treat as named parameters
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      return format(text, args[0] as Record<string, unknown>);
    }
    return format(text, args as unknown[]);
  }
}

