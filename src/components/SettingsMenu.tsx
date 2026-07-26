'use client';

import { useEffect, useRef, useState } from 'react';

import { usePreferences, type ThemeMode } from './PreferencesProvider';
import type { LocaleMode } from '@/lib/i18n';

export default function SettingsMenu() {
  const { localeMode, setLocaleMode, themeMode, setThemeMode, t } =
    usePreferences();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? t('closeSettings') : t('settings')}
        title={t('settings')}
        className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-strong)]"
      >
        <span aria-hidden className="text-base">⚙</span>
        <span className="hidden sm:inline">{t('settings')}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('settings')}
          className="absolute right-0 top-12 z-30 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-[var(--border)] bg-[var(--tooltip)] p-4 shadow-xl shadow-[var(--shadow)] backdrop-blur"
        >
          <SettingGroup label={t('language')}>
            <Choice
              active={localeMode === 'system'}
              label={t('system')}
              onClick={() => setLocaleMode('system')}
            />
            <Choice
              active={localeMode === 'zh-CN'}
              label={t('chinese')}
              onClick={() => setLocaleMode('zh-CN')}
            />
            <Choice
              active={localeMode === 'en'}
              label={t('english')}
              onClick={() => setLocaleMode('en')}
            />
          </SettingGroup>

          <div className="my-4 border-t border-[var(--border)]" />

          <SettingGroup label={t('theme')}>
            {(
              [
                ['system', '◐', t('system')],
                ['light', '☀', t('light')],
                ['dark', '☾', t('dark')],
              ] as [ThemeMode, string, string][]
            ).map(([value, icon, label]) => (
              <Choice
                key={value}
                active={themeMode === value}
                label={label}
                icon={icon}
                onClick={() => setThemeMode(value)}
              />
            ))}
          </SettingGroup>
        </div>
      )}
    </div>
  );
}

function SettingGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-soft)]">
        {label}
      </h2>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface)] p-1">
        {children}
      </div>
    </section>
  );
}

function Choice({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex min-h-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition ' +
        (active
          ? 'bg-[var(--control-active)] text-[var(--text)] shadow-sm'
          : 'text-[var(--muted)] hover:text-[var(--text)]')
      }
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
