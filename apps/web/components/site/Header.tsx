import Link from 'next/link';
import { NAV, SIGNUP_CTA } from '@/lib/site';
import { Logo } from './Logo';
import { btn, container } from './ui';

// Own padding: btn.base's px-xl would win over a smaller px-* in the same class list.
const navBtn =
  'inline-flex min-h-10 items-center justify-center rounded-pill text-body-small font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/85 backdrop-blur-md">
      <div className={`${container} flex items-center justify-between gap-md py-md`}>
        <Logo className="h-6 w-auto max-[359px]:h-5 sm:h-7 md:h-8" />
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
        <div className="flex shrink-0 items-center gap-xs sm:gap-sm">
          <Link
            href="/painel"
            className={`${navBtn} px-sm text-text hover:bg-surface-alt sm:border sm:border-text sm:bg-surface sm:px-lg`}
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className={`${navBtn} ${btn.accent} px-md max-[359px]:px-sm sm:px-lg`}
          >
            <span className="sm:hidden">Começar grátis</span>
            <span className="hidden sm:inline">{SIGNUP_CTA}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
