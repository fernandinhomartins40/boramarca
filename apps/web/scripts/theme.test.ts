import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { renderThemeCss } from './gen-theme';

it('app/theme.css is in sync with packages/shared theme (run `pnpm --filter @boramarca/web theme`)', () => {
  const committed = readFileSync(new URL('../app/theme.css', import.meta.url), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  expect(committed).toBe(renderThemeCss());
});

it('exposes every semantic token as a Tailwind color', () => {
  const css = renderThemeCss();
  for (const t of [
    'bg',
    'surface',
    'text',
    'text-muted',
    'primary',
    'on-primary',
    'accent',
    'danger',
  ])
    expect(css).toContain(`--color-${t}: var(--bm-${t});`);
});

it('keeps max-w-sm/md/xl on the container sizes, not on the spacing tokens', () => {
  const css = renderThemeCss();
  for (const k of ['sm', 'md', 'xl']) {
    expect(css).toContain(`--spacing-${k}:`);
    expect(css).toContain(`--max-width-${k}: var(--container-${k});`);
  }
});
