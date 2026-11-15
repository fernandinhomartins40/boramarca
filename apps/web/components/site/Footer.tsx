import Link from 'next/link';
import { LEGAL_LINKS } from '@/lib/site';
import { Logo } from './Logo';
import { container } from './ui';

export function Footer() {
  return (
    <footer className="bg-bg">
      <div
        className={`${container} flex flex-col gap-lg py-xxl text-body-small text-text md:flex-row md:items-center md:justify-between`}
      >
        <div className="flex items-center gap-lg">
          <Logo className="h-6 w-auto" />
          <span aria-hidden className="h-6 w-px bg-border" />
          <p className="text-text-muted">Sua agenda, no seu ritmo.</p>
        </div>
        <nav aria-label="Institucional">
          <ul className="flex flex-wrap items-center gap-x-lg gap-y-sm">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link className="hover:text-primary-text hover:underline" href={l.href}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="text-text-muted">©2026 Bora Marca</li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
