import type { ReactNode } from 'react';
import { container } from './ui';

/** Long-form page (privacy, terms): readable column, headings in HTML. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="conteudo" className={`${container} py-xxxl`}>
      <article className="legal mx-auto max-w-[48rem]">
        <h1 className="text-display text-text">{title}</h1>
        <p className="mt-sm text-caption text-text-muted">Atualizado em {updated}</p>
        {intro && <div className="mt-xl text-body text-text">{intro}</div>}
        {children}
      </article>
    </main>
  );
}
