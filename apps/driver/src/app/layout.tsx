import type { Metadata, Viewport } from 'next';

import '@gestlog/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'GESTLOG Driver',
  description: 'Aplicativo do motorista — offline-first.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
