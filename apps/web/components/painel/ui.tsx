'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiCallError } from '@/lib/api';
import { initials } from './format';

/** Small building blocks of the owner panel (tokens only; see app/theme.css). */

export const card = 'rounded-lg border border-border bg-surface';
export const chip =
  'inline-flex min-h-10 items-center gap-sm rounded-pill border border-border bg-surface px-lg text-body-small text-text hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-primary aria-pressed:border-transparent aria-pressed:bg-surface-alt aria-pressed:font-semibold aria-pressed:text-primary-text';
export const btnSm =
  'inline-flex min-h-10 items-center justify-center gap-sm rounded-md px-lg text-body-small font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 motion-reduce:transition-none';
export const btnPrimary = `${btnSm} bg-primary text-on-primary hover:bg-brand-grafite`;
export const btnOutline = `${btnSm} border border-border bg-surface text-text hover:bg-surface-alt`;

export const errorText = (e: unknown) =>
  e instanceof ApiCallError ? e.message : 'Algo deu errado. Tente de novo em instantes.';

/** Loads data on mount and whenever `deps` change; `reload` keeps the old data on screen. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], refreshMs?: number) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({
    loading: true,
  });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fnRef.current();
      if (n === seq.current) setState({ data, loading: false });
    } catch (e) {
      if (n === seq.current)
        setState((s) => ({ data: s.data, error: errorText(e), loading: false }));
    }
  }, []);
  useEffect(() => {
    setState({ loading: true });
    void reload();
    if (!refreshMs) return;
    const t = setInterval(() => void reload(), refreshMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload };
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-md p-xl text-body-small text-text-muted">
      <span
        aria-hidden
        className="size-5 animate-spin rounded-pill border-2 border-border border-t-primary"
      />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={`${card} flex flex-wrap items-center gap-lg p-xl`}>
      <p className="flex-1 text-body text-danger">{message}</p>
      {onRetry && (
        <button type="button" className={btnOutline} onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={`${card} p-xxl text-center`}>
      <p className="text-heading text-text">{title}</p>
      {children && <p className="mt-sm text-body-small text-text-muted">{children}</p>}
    </div>
  );
}

/** Loading / error / content in one place. */
export function Async<T>({
  state,
  children,
}: {
  state: { data?: T; error?: string; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode;
}) {
  if (state.data === undefined) {
    if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />;
    return <Loading />;
  }
  return (
    <>
      {state.error && (
        <div className="mb-lg">
          <ErrorBox message={state.error} onRetry={state.reload} />
        </div>
      )}
      {children(state.data)}
    </>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = {
    sm: 'size-8 text-caption',
    md: 'size-11 text-body-small',
    lg: 'size-14 text-heading',
  }[size];
  return (
    <span
      aria-hidden
      className={`${s} inline-flex shrink-0 items-center justify-center rounded-md bg-surface-alt font-bold text-primary-text`}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-xl flex flex-wrap items-end justify-between gap-lg">
      <div>
        <h1 className="text-display text-text">{title}</h1>
        {subtitle && <p className="mt-xs text-body text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-md">{actions}</div>}
    </div>
  );
}

/** Line icons drawn like the kit's 06-icones-interface set (24px grid, 1.7 stroke, currentColor). */
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  chart: 'M5 20v-6M12 20V5M19 20v-9',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21v-1a7 7 0 0 1 14 0v1',
  card: 'M3 6h18v13H3zM3 10h18M7 15h4',
  calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 11h18',
  chat: 'M4 5h16v11H9l-5 4z',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  check: 'M5 12l5 5 9-10',
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5',
  plus: 'M12 5v14M5 12h14',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11',
  phone:
    'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  lunch: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 3-3 7h3v11',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  menu: 'M4 7h16M4 12h16M4 17h16',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
