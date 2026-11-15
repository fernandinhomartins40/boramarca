import type { ReactNode } from 'react';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-sm focus:left-sm focus:z-10 focus:rounded-md focus:bg-primary focus:px-lg focus:py-sm focus:text-on-primary"
      >
        Pular para o conteúdo
      </a>
      <Header />
      {children}
      <Footer />
    </>
  );
}
