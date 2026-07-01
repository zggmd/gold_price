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
  themeColor: '#070a12',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
