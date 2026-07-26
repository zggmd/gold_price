import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '实时贵金属行情 · ICBC 金价',
  description:
    '工商银行账户贵金属实时与历史金价查询：黄金、白银、铂金、钯金（人民币 / 美元）。',
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

const themeScript = `
(() => {
  try {
    const saved = localStorage.getItem('gold-theme');
    const mode = saved === 'light' || saved === 'dark' ? saved : 'system';
    const theme = mode === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.theme = theme;
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
