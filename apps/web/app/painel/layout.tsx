import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PanelShell } from '@/components/painel/PanelShell';

// Private area: robots.txt already disallows /painel and it stays out of sitemap.xml.
export const metadata: Metadata = {
  title: 'Painel',
  robots: { index: false, follow: false },
};

export default function PainelLayout({ children }: { children: ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
