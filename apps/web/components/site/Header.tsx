import Link from 'next/link';
import { NAV, SIGNUP_CTA } from '@/lib/site';
import { Logo } from './Logo';
import { btn, container } from './ui';

export function Header() {
  return (
    <header className="bg-bg">
      <div className={`${container} flex items-center justify-between gap-lg py-lg`}>
        <Logo className="h-7 w-auto md:h-8" />
        <nav aria-label="Seções" className="hidden lg:block">
          <ul className="flex gap-xxl text-body-small text-text">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  className="rounded-sm hover:text-primary-text focus-visible:outline-2 focus-visible:outline-primary"
                  href={n.href}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-sm">
          <Link
            href="/painel"
            className={`${btn.base} ${btn.outline} min-h-10 px-lg text-body-small`}
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className={`${btn.base} ${btn.accent} min-h-10 px-lg text-body-small`}
          >
            <span className="sm:hidden">Começar grátis</span>
            <span className="hidden sm:inline">{SIGNUP_CTA}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
