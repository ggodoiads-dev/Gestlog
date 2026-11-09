import type { Metadata } from 'next';

import '@gestlog/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'GESTLOG — Sua transportadora sob controle',
  description:
    'ERP SaaS multi-tenant para transportadoras brasileiras de fretamento corporativo. Rotagrama, operação e financeiro em uma única central.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
