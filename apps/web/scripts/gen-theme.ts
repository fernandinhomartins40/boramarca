/**
 * Generates app/theme.css (Tailwind 4 @theme) from packages/shared/src/theme.ts.
 * Runs before `dev` and `build`; theme.test.ts fails if the committed file is stale.
 * Usage: pnpm --filter @boramarca/web theme
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  brand,
  colors,
  radii,
  spacing,
  typography,
  web,
  fontWeight,
  type ColorScheme,
} from '@boramarca/shared/theme';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const vars = (c: ColorScheme, indent: string) =>
  Object.entries(c)
    .map(([k, v]) => `${indent}--bm-${kebab(k)}: ${v};`)
    .join('\n');

/** Tailwind 4's default --container-* names. */
const CONTAINERS = '3xs 2xs xs sm md lg xl 2xl 3xl 4xl 5xl 6xl 7xl'.split(' ');
const sizeKeys = Object.keys(spacing).filter((k) => CONTAINERS.includes(k));

export function renderThemeCss(): string {
  const tokenNames = Object.keys(colors.light);
  return `/* GERADO por scripts/gen-theme.ts a partir de @boramarca/shared/theme. Não edite à mão. */

/* Only design tokens exist as colors: Tailwind's default palette is removed. */
@theme {
  --color-*: initial;
  --radius-*: initial;
  --text-*: initial;
  --color-transparent: transparent;
  --color-current: currentColor;
${Object.entries(brand)
  .map(([k, v]) => `  --color-brand-${k}: ${v};`)
  .join('\n')}
${Object.entries(radii)
  .map(([k, v]) => `  --radius-${k}: ${v}px;`)
  .join('\n')}
${Object.entries(typography)
  .map(
    ([k, t]) =>
      `  --text-${kebab(k)}: ${t.fontSize / 16}rem;\n  --text-${kebab(k)}--line-height: ${t.lineHeight / 16}rem;\n  --text-${kebab(k)}--font-weight: ${fontWeight[t.weight]};`,
  )
  .join('\n')}
${Object.entries(spacing)
  .map(([k, v]) => `  --spacing-${k}: ${v}px;`)
  .join('\n')}
  --container-bora: ${web.container};
  /* max-w-*, w-* and min-w-* read --spacing-* before --container-*, so the names both share
     (sm, md…) would size to the spacing token. Their own namespaces win: back to the containers. */
${sizeKeys
  .flatMap((k) =>
    ['max-width', 'width', 'min-width'].map((ns) => `  --${ns}-${k}: var(--container-${k});`),
  )
  .join('\n')}
}

/* Semantic tokens switch with the color scheme. */
@theme inline {
  --font-sans: var(--font-brand), system-ui, -apple-system, 'Segoe UI', sans-serif;
${tokenNames.map((k) => `  --color-${kebab(k)}: var(--bm-${kebab(k)});`).join('\n')}
}

:root {
  --bora-gutter: ${web.gutter};
  --bora-radius: ${web.radius};
${vars(colors.light, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${vars(colors.dark, '    ')}
  }
}

[data-theme='dark'] {
${vars(colors.dark, '  ')}
}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL('../app/theme.css', import.meta.url));
  writeFileSync(out, renderThemeCss());
  console.log(`[theme] ${out}`);
}
