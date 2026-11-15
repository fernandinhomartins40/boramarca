/** Shared class names for the public site (tokens only; see app/theme.css). */
export const btn = {
  base: 'inline-flex min-h-11 items-center justify-center gap-sm rounded-pill px-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 motion-reduce:transition-none',
  accent: 'bg-accent text-on-accent hover:bg-brand-branco',
  primary: 'bg-primary text-on-primary hover:bg-brand-grafite',
  outline: 'border border-text bg-surface text-text hover:bg-surface-alt',
  danger: 'bg-danger text-on-danger hover:opacity-90',
} as const;

export const container = 'mx-auto w-full max-w-bora px-[var(--bora-gutter)]';

export const input =
  'mt-xs block min-h-11 w-full rounded-md border border-border bg-surface px-lg py-sm text-body text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary aria-[invalid=true]:border-danger';
