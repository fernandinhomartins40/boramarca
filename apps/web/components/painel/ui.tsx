'use client';

import {
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  CalendarDays,
  Download,
  Globe,
  LayoutGrid,
  LifeBuoy,
  House,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  User,
  Users,
  Utensils,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
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
      <p className="min-w-[14rem] flex-1 text-body text-danger">{message}</p>
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
        <h1 className="text-title text-text md:text-display">{title}</h1>
        {subtitle && <p className="mt-xs text-body text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-md">{actions}</div>}
    </div>
  );
}

/** Interface icons: lucide-react, one library for the whole site and panel (the app uses lucide-react-native). */
const ICONS = {
  home: House,
  chart: ChartColumn,
  team: Users,
  user: User,
  card: CreditCard,
  calendar: CalendarDays,
  chat: MessageCircle,
  sparkle: Sparkles,
  check: Check,
  close: X,
  left: ChevronLeft,
  right: ChevronRight,
  download: Download,
  search: Search,
  plus: Plus,
  speaker: Volume2,
  phone: Phone,
  clock: Clock,
  logout: LogOut,
  lunch: Utensils,
  edit: Pencil,
  menu: Menu,
  more: LayoutGrid,
  help: LifeBuoy,
  site: Globe,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return <C aria-hidden strokeWidth={1.75} className={`shrink-0 ${className}`} />;
}
