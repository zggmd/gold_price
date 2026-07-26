import type { Metadata, Viewport } from 'next';

import PreferencesProvider from '@/components/PreferencesProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'ICBC Precious Metals · 工商银行贵金属行情',
  description:
    'Live and historical ICBC account precious-metal prices · 工商银行账户贵金属实时与历史行情。',
  applicationName: 'Gold Price Dashboard',
  icons: {
    icon:
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%23f59e0b"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="%2378350f" font-family="sans-serif" font-weight="bold">Au</text></svg>',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4ec' },
    { media: '(prefers-color-scheme: dark)', color: '#070a12' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const preferencesScript = `
(() => {
  try {
    const savedTheme = localStorage.getItem('gold-theme');
    const themeMode = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : 'system';
    const theme = themeMode === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : themeMode;

    const savedLocale = localStorage.getItem('gold-locale');
    const localeMode = savedLocale === 'zh-CN' || savedLocale === 'en'
      ? savedLocale
      : 'system';
    const locale = localeMode === 'system'
      ? (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en')
      : localeMode;

    document.documentElement.dataset.themeMode = themeMode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.localeMode = localeMode;
    document.documentElement.lang = locale;
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencesScript }} />
      </head>
      <body>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
