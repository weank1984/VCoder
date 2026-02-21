import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../store/useStore';
import I18n, { resolveLanguage, type SupportedLanguage, type UiLanguage } from './index';

type I18nContextValue = {
  language: SupportedLanguage;
  uiLanguage: UiLanguage;
  setUiLanguage: (uiLanguage: UiLanguage) => void;
  t: typeof I18n.t;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children?: ReactNode }) {
  const { uiLanguage, setUiLanguage } = useStore();

  const vscodeDisplayLanguage = (globalThis as unknown as { __vscodeLanguage?: string }).__vscodeLanguage;
  const language = resolveLanguage(vscodeDisplayLanguage, uiLanguage);

  if (I18n.getCurrentLanguage() !== language) {
    I18n.init(language);
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      uiLanguage,
      setUiLanguage: (next) => setUiLanguage(next, 'user'),
      t: I18n.t.bind(I18n),
    }),
    [language, uiLanguage, setUiLanguage],
  );

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      language: I18n.getCurrentLanguage(),
      uiLanguage: 'auto',
      setUiLanguage: () => {},
      t: I18n.t.bind(I18n),
    };
  }
  return ctx;
}
