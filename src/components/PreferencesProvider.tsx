'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  systemLocale,
  translate,
  type Locale,
  type LocaleMode,
  type MessageKey,
} from '@/lib/i18n';

export type ThemeMode = 'system' | 'light' | 'dark';

interface PreferencesContextValue {
  locale: Locale;
  localeMode: LocaleMode;
  setLocaleMode: (mode: LocaleMode) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  t: (key: MessageKey) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
}

function applyLocale(mode: LocaleMode): Locale {
  const locale = mode === 'system' ? systemLocale() : mode;
  const root = document.documentElement;
  root.dataset.localeMode = mode;
  root.lang = locale;
  return locale;
}

export default function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [localeMode, setLocaleModeState] = useState<LocaleMode>('system');
  const [locale, setLocale] = useState<Locale>('zh-CN');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('gold-theme');
    const initialTheme: ThemeMode =
      savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
        ? savedTheme
        : 'system';
    const savedLocale = window.localStorage.getItem('gold-locale');
    const initialLocale: LocaleMode =
      savedLocale === 'zh-CN' || savedLocale === 'en' || savedLocale === 'system'
        ? savedLocale
        : 'system';

    setThemeModeState(initialTheme);
    setLocaleModeState(initialLocale);
    applyTheme(initialTheme);
    setLocale(applyLocale(initialLocale));

    const colorMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const languageTarget = window;
    const handleThemeChange = () => {
      if ((document.documentElement.dataset.themeMode ?? 'system') === 'system') {
        applyTheme('system');
      }
    };
    const handleLanguageChange = () => {
      if ((document.documentElement.dataset.localeMode ?? 'system') === 'system') {
        setLocale(applyLocale('system'));
      }
    };
    colorMedia.addEventListener('change', handleThemeChange);
    languageTarget.addEventListener('languagechange', handleLanguageChange);
    return () => {
      colorMedia.removeEventListener('change', handleThemeChange);
      languageTarget.removeEventListener('languagechange', handleLanguageChange);
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    window.localStorage.setItem('gold-theme', mode);
    applyTheme(mode);
  }, []);

  const setLocaleMode = useCallback((mode: LocaleMode) => {
    setLocaleModeState(mode);
    window.localStorage.setItem('gold-locale', mode);
    setLocale(applyLocale(mode));
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      locale,
      localeMode,
      setLocaleMode,
      themeMode,
      setThemeMode,
      t: (key) => translate(locale, key),
    }),
    [locale, localeMode, setLocaleMode, setThemeMode, themeMode],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
