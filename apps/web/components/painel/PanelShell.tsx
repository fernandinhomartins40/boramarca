'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AUTOMATION_PAUSED_MESSAGE, routes, type MeResponse } from '@boramarca/shared';
import { Logo } from '@/components/site/Logo';
import { browserStore, createClient, type PanelClient } from './client';
import { Login } from './Login';
import { btnOutline, ErrorBox, errorText, Icon, Loading, type IconName } from './ui';

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
  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-sm focus:left-sm focus:z-20 focus:rounded-md focus:bg-primary focus:px-lg focus:py-sm focus:text-on-primary"
      >
        Pular para o conteúdo
      </a>
      <aside className="flex flex-col gap-lg border-border bg-surface-alt/50 p-lg lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:p-xl">
        <div className="flex items-center justify-between gap-lg">
          <Logo className="h-8 w-auto" />
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-xs rounded-md p-sm text-body-small text-text-muted hover:text-text lg:hidden"
          >
            <Icon name="logout" /> Sair
          </button>
        </div>
        <p className="hidden truncate text-body-small font-semibold text-text lg:block lg:pt-lg">
          {me.salon.name}
        </p>
        <nav aria-label="Painel" className="-mx-lg overflow-x-auto px-lg lg:mx-0 lg:px-0">
          <ul className="flex gap-xs lg:flex-col">
            {NAV.map((n) => {
              const active = n.href === '/painel' ? path === '/painel' : path.startsWith(n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-md rounded-md px-lg text-body whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary ${
                      active
                        ? 'bg-primary font-semibold text-on-primary'
                        : 'text-text hover:bg-surface-alt'
                    }`}
                  >
                    <Icon name={n.icon} />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
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
      <main id="conteudo" className="min-w-0 flex-1 p-lg md:p-xl">
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
  );
}
