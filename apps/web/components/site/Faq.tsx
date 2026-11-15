import type { ReactNode } from 'react';

/**
 * Accordion built on native <details>/<summary>: keyboard (Tab, Enter, Space) and screen
 * readers work without script.
 */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-border">
      {items.map((it, i) => (
        <details key={it.q} open={i === 0} className="group rounded-lg open:bg-surface-alt">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-lg rounded-lg px-lg py-md text-body font-semibold text-text focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            {it.q}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-5 shrink-0 fill-none stroke-current stroke-2 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="px-lg pb-lg text-body-small text-text-muted">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
