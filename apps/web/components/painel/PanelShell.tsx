'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AUTOMATION_PAUSED_MESSAGE, routes, type MeResponse } from '@boramarca/shared';
import { Logo } from '@/components/site/Logo';
import { browserStore, createClient, type PanelClient } from './client';
import { Login } from './Login';
import { Avatar, btnOutline, ErrorBox, errorText, Icon, Loading, type IconName } from './ui';

interface Session {
  api: PanelClient;
  me: MeResponse;
  logout: () => void;
}
const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside PanelShell');
  return s;
}

type State =
  | { kind: 'loading' }
  | { kind: 'anon'; notice?: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; me: MeResponse };

export const NOT_OWNER_NOTICE =
  'Este painel é só para quem é dono do espaço. Use o app Bora Marca no celular para ver a sua agenda.';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/painel', label: 'Hoje', icon: 'home' },
  { href: '/painel/resultados', label: 'Resultados', icon: 'chart' },
  { href: '/painel/equipe', label: 'Equipe', icon: 'team' },
  { href: '/painel/clientes', label: 'Clientes', icon: 'user' },
  { href: '/painel/plano', label: 'Plano', icon: 'card' },
];

export function PanelShell({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const api = useMemo(
    () =>
      createClient(browserStore, {
        onExpired: () => setState({ kind: 'anon', notice: 'Sua sessão terminou. Entre de novo.' }),
      }),
    [],
  );

  const loadMe = useCallback(async () => {
    if (!browserStore.get()) return setState({ kind: 'anon' });
    setState({ kind: 'loading' });
    try {
      const me = await api.call(routes.auth.me);
      if (me.professional.role !== 'owner') {
        browserStore.set(null);
        return setState({ kind: 'anon', notice: NOT_OWNER_NOTICE });
      }
      setState({ kind: 'ready', me });
    } catch (e) {
      if (!browserStore.get()) return; // onExpired already moved to the login
      setState({ kind: 'error', message: errorText(e) });
    }
  }, [api]);

  useEffect(() => {
    // Reads localStorage, so it can only run in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMe();
  }, [loadMe]);

  const logout = useCallback(() => {
    browserStore.set(null);
    setState({ kind: 'anon' });
  }, []);

  if (state.kind === 'loading')
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loading label="Abrindo o painel…" />
      </div>
    );
  if (state.kind === 'anon')
    return <Login api={api} notice={state.notice} onLoggedIn={() => void loadMe()} />;
  if (state.kind === 'error')
    return (
      <div className="mx-auto grid min-h-dvh max-w-xl place-items-center p-xl">
        <div className="w-full space-y-lg">
          <ErrorBox message={state.message} onRetry={() => void loadMe()} />
          <button type="button" className={btnOutline} onClick={logout}>
            Sair
          </button>
        </div>
      </div>
    );

  return (
    <SessionContext.Provider value={{ api, me: state.me, logout }}>
      <Layout me={state.me} logout={logout}>
        {children}
      </Layout>
    </SessionContext.Provider>
  );
}

const isActive = (path: string, href: string) =>
  href === '/painel' ? path === '/painel' : path.startsWith(href);
const nav = (href: string) => NAV.find((n) => n.href === href)!;

// Phone tab bar: two tabs on each side of "Hoje" (raised, in the middle); the last one opens "Mais".
const TABS_LEFT = ['/painel/resultados', '/painel/clientes'];
const TABS_RIGHT = ['/painel/equipe'];
const MORE_LINKS: { href: string; label: string; hint: string; icon: IconName }[] = [
  {
    href: '/painel/plano',
    label: 'Plano',
    hint: 'Assinatura, uso e e-mail da conta',
    icon: 'card',
  },
  { href: '/contato', label: 'Ajuda e contato', hint: 'Fale com o time Bora Marca', icon: 'help' },
  { href: '/', label: 'Site Bora Marca', hint: 'Página inicial', icon: 'site' },
];

const pressable =
  'transition-transform select-none active:scale-95 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none';

function Tab({ href, path }: { href: string; path: string }) {
  const n = nav(href);
  const active = isActive(path, href);
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex h-16 flex-col items-center justify-center gap-xs rounded-md text-caption ${pressable} ${
          active ? 'font-semibold text-primary-text' : 'text-text-muted'
        }`}
      >
        <span
          className={`flex h-7 w-12 items-center justify-center rounded-pill ${active ? 'bg-surface-alt' : ''}`}
        >
          <Icon name={n.icon} className="size-6" />
        </span>
        {n.label}
      </Link>
    </li>
  );
}

function Layout({
  me,
  logout,
  children,
}: {
  me: MeResponse;
  logout: () => void;
  children: ReactNode;
}) {
  const path = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  // Navigating from the "Mais" sheet closes it.
  useEffect(() => sheet.current?.close(), [path]);
  const moreActive = MORE_LINKS.some((m) => m.href.startsWith('/painel') && isActive(path, m.href));
  const home = isActive(path, '/painel');

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-sm focus:left-sm focus:z-50 focus:rounded-md focus:bg-primary focus:px-lg focus:py-sm focus:text-on-primary"
      >
        Pular para o conteúdo
      </a>

      {/* Tablet: icon rail. Desktop: full sidebar. */}
      <aside className="hidden border-r border-border bg-surface-alt/50 md:sticky md:top-0 md:flex md:h-dvh md:w-24 md:shrink-0 md:flex-col md:items-center md:gap-xl md:px-sm md:py-xl lg:w-64 lg:items-stretch lg:gap-lg lg:p-xl">
        <Link href="/painel" aria-label="Bora Marca, início" className="lg:hidden">
          <Image
            src="/marca/simbolo-cor.svg"
            alt=""
            width={236}
            height={304}
            unoptimized
            className="h-10 w-auto"
          />
        </Link>
        <div className="hidden lg:block">
          <Logo className="h-8 w-auto" />
        </div>
        <p className="hidden truncate text-body-small font-semibold text-text lg:block lg:pt-lg">
          {me.salon.name}
        </p>
        <nav aria-label="Painel" className="w-full">
          <ul className="flex flex-col gap-xs">
            {NAV.map((n) => {
              const active = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-col items-center gap-xs rounded-md px-xs py-sm text-caption ${pressable} lg:min-h-11 lg:flex-row lg:gap-md lg:px-lg lg:py-0 lg:text-body ${
                      active
                        ? 'bg-primary font-semibold text-on-primary'
                        : 'text-text hover:bg-surface-alt'
                    }`}
                  >
                    <Icon name={n.icon} className="size-6 lg:size-5" />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <button
          type="button"
          onClick={logout}
          className={`mt-auto flex flex-col items-center gap-xs rounded-md px-xs py-sm text-caption text-text-muted hover:text-text lg:hidden ${pressable}`}
        >
          <Icon name="logout" className="size-6" /> Sair
        </button>
        <div className="mt-auto hidden rounded-lg border border-border bg-surface p-lg lg:block">
          <p className="truncate text-body-small font-semibold text-text">{me.professional.name}</p>
          <p className="text-caption text-text-muted">Dono(a) do espaço</p>
          <button
            type="button"
            onClick={logout}
            className="mt-md inline-flex items-center gap-xs text-body-small font-semibold text-primary-text hover:underline"
          >
            <Icon name="logout" className="size-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone: app bar. */}
        <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center gap-md px-lg">
            <Image
              src="/marca/simbolo-cor.svg"
              alt=""
              width={236}
              height={304}
              unoptimized
              className="h-8 w-auto"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold text-text">{me.salon.name}</p>
              <p className="truncate text-caption text-text-muted">{me.professional.name}</p>
            </div>
            <Avatar name={me.professional.name} size="sm" />
          </div>
        </header>

        <main
          id="conteudo"
          className="min-w-0 flex-1 p-lg pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-xl"
        >
          {me.billing?.automationPaused && (
            <Link
              href="/painel/plano"
              role="alert"
              className="mb-lg flex items-center gap-md rounded-md bg-warning px-lg py-md text-body font-semibold text-on-warning"
            >
              <Icon name="sparkle" /> {AUTOMATION_PAUSED_MESSAGE}
              <Icon name="right" className="ml-auto size-5" />
            </Link>
          )}
          {children}
        </main>
      </div>

      {/* Phone: bottom tab bar. */}
      <nav
        aria-label="Painel"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5 items-end px-xs">
          {TABS_LEFT.map((h) => (
            <Tab key={h} href={h} path={path} />
          ))}
          <li className="flex justify-center">
            <Link
              href="/painel"
              aria-current={home ? 'page' : undefined}
              className={`-mt-lg flex flex-col items-center gap-xs pb-sm text-caption ${pressable} ${
                home ? 'font-semibold text-primary-text' : 'text-text-muted'
              }`}
            >
              <span className="flex size-14 items-center justify-center rounded-pill bg-primary text-on-primary shadow-lg ring-4 ring-bg">
                <Icon name="home" className="size-7" />
              </span>
              Hoje
            </Link>
          </li>
          {TABS_RIGHT.map((h) => (
            <Tab key={h} href={h} path={path} />
          ))}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => sheet.current?.showModal()}
              className={`flex h-16 w-full flex-col items-center justify-center gap-xs rounded-md text-caption ${pressable} ${
                moreActive ? 'font-semibold text-primary-text' : 'text-text-muted'
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-pill ${moreActive ? 'bg-surface-alt' : ''}`}
              >
                <Icon name="more" className="size-6" />
              </span>
              Mais
            </button>
          </li>
        </ul>
      </nav>

      {/* "Mais": bottom sheet (native <dialog>: Esc, focus and the backdrop for free). */}
      <dialog
        ref={sheet}
        aria-label="Mais opções"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="bm-sheet m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-[1.75rem] bg-surface p-0 text-text backdrop:bg-brand-grafite/50 md:hidden"
      >
        <div className="px-lg pt-md pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <span aria-hidden className="mx-auto block h-1.5 w-10 rounded-pill bg-border" />
          <div className="mt-lg flex items-center gap-md">
            <Avatar name={me.professional.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">{me.professional.name}</p>
              <p className="truncate text-body-small text-text-muted">{me.salon.name}</p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => sheet.current?.close()}
              className={`flex size-10 items-center justify-center rounded-pill bg-surface-alt ${pressable}`}
            >
              <Icon name="close" />
            </button>
          </div>
          <ul className="mt-lg divide-y divide-border overflow-hidden rounded-lg border border-border">
            {MORE_LINKS.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  onClick={() => sheet.current?.close()}
                  className="flex min-h-14 items-center gap-md px-lg py-md select-none active:bg-surface-alt focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-primary-text">
                    <Icon name={m.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold">{m.label}</span>
                    <span className="block truncate text-body-small text-text-muted">{m.hint}</span>
                  </span>
                  <Icon name="right" className="size-5 text-text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={logout}
            className={`mt-lg flex min-h-12 w-full items-center justify-center gap-sm rounded-pill border border-border text-body font-semibold text-danger ${pressable}`}
          >
            <Icon name="logout" /> Sair da conta
          </button>
        </div>
      </dialog>
    </div>
  );
}
