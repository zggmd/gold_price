'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

const OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'system', label: '跟随系统', icon: '◐' },
  { value: 'light', label: '明亮', icon: '☀' },
  { value: 'dark', label: '黑暗', icon: '☾' },
];

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

export default function ThemeSelector() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    const saved = window.localStorage.getItem('gold-theme');
    const initial: ThemeMode =
      saved === 'light' || saved === 'dark' || saved === 'system'
        ? saved
        : 'system';
    setMode(initial);
    applyTheme(initial);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if ((document.documentElement.dataset.themeMode ?? 'system') === 'system') {
        applyTheme('system');
      }
    };
    media.addEventListener('change', handleSystemChange);
    return () => media.removeEventListener('change', handleSystemChange);
  }, []);

  function choose(next: ThemeMode) {
    setMode(next);
    window.localStorage.setItem('gold-theme', next);
    applyTheme(next);
  }

  return (
    <div
      className="theme-control inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
      role="group"
      aria-label="主题模式"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          aria-pressed={mode === option.value}
          title={option.label}
          className={
            'flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition ' +
            (mode === option.value
              ? 'bg-[var(--control-active)] text-[var(--text)] shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--text)]')
          }
        >
          <span aria-hidden>{option.icon}</span>
          <span className="hidden xl:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
