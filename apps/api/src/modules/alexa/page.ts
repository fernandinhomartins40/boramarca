// Account linking login page (served by the API, mobile first, no pop-up, no JavaScript): phone →
// code → redirect to Amazon. Colors, spacing and type come only from packages/shared theme.ts;
// the logo is the kit file as is (Bora-Marca-Kit/01-marca/svg/logo-horizontal-cor.svg).
import { readFileSync } from 'node:fs';
import {
  fontFamilyWeb,
  fontWeight,
  lightColors as c,
  radii,
  spacing,
  touchTarget,
  typography,
} from '@boramarca/shared';
import { ALEXA_REDIRECT_PREFIXES } from '@boramarca/alexa';

const logo = `data:image/svg+xml;base64,${readFileSync(
  new URL('./assets/logo-horizontal-cor.svg', import.meta.url),
).toString('base64')}`;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
const px = (n: number) => `${n}px`;
const type = (t: { fontSize: number; lineHeight: number; weight: keyof typeof fontWeight }) =>
  `font-size:${px(t.fontSize)};line-height:${px(t.lineHeight)};font-weight:${fontWeight[t.weight]}`;

/** Security headers for the page: no framing (clickjacking), form posts only here or to Amazon. */
export const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    `form-action 'self' ${ALEXA_REDIRECT_PREFIXES.map((p) => new URL(p).origin).join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '),
};

const css = `
*{box-sizing:border-box}
body{margin:0;background:${c.bg};color:${c.text};font-family:${fontFamilyWeb};${type(typography.body)}}
main{max-width:440px;margin:0 auto;padding:${px(spacing.xxl)} ${px(spacing.lg)}}
.logo{display:block;width:180px;height:auto;margin:0 0 ${px(spacing.xxl)}}
h1{${type(typography.title)};margin:0 0 ${px(spacing.sm)}}
p{margin:0 0 ${px(spacing.xl)};color:${c.textMuted}}
.card{background:${c.surface};border:1px solid ${c.border};border-radius:${px(radii.lg)};padding:${px(spacing.xl)}}
label{display:block;${type(typography.bodySmall)};font-weight:${fontWeight.semibold};margin:0 0 ${px(spacing.sm)};color:${c.text}}
input{width:100%;min-height:${px(touchTarget.min)};padding:0 ${px(spacing.lg)};border:1px solid ${c.border};border-radius:${px(radii.md)};background:${c.surface};color:${c.text};font:inherit;margin:0 0 ${px(spacing.lg)}}
input:focus{outline:2px solid ${c.primary};outline-offset:1px}
button{width:100%;min-height:${px(touchTarget.button.md)};border:0;border-radius:${px(radii.pill)};background:${c.primary};color:${c.onPrimary};font:inherit;font-weight:${fontWeight.semibold};cursor:pointer}
.link{background:none;color:${c.primaryText};min-height:${px(touchTarget.min)};margin-top:${px(spacing.sm)}}
.error{background:${c.surfaceAlt};color:${c.danger};border-radius:${px(radii.md)};padding:${px(spacing.md)};margin:0 0 ${px(spacing.lg)};${type(typography.bodySmall)}}
small{display:block;margin-top:${px(spacing.xl)};color:${c.textMuted};${type(typography.caption)}}
`;

export interface PageState {
  /** The validated Alexa query, carried as hidden fields (null when the request itself is invalid). */
  oauth: Record<string, string> | null;
  step: 'phone' | 'code';
  phone?: string;
  error?: string;
}

export function linkPage(action: string, s: PageState): string {
  const hidden = Object.entries(s.oauth ?? {})
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  const error = s.error ? `<div class="error" role="alert">${esc(s.error)}</div>` : '';
  let body: string;
  if (!s.oauth) body = error;
  else if (s.step === 'phone')
    body = `${error}<form method="post" action="${esc(action)}">${hidden}
<input type="hidden" name="step" value="phone">
<label for="phone">Seu celular com DDD</label>
<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(11) 98765-4321" value="${esc(s.phone ?? '')}">
<button type="submit">Receber código</button></form>`;
  else
    body = `${error}<form method="post" action="${esc(action)}">${hidden}
<input type="hidden" name="step" value="code">
<input type="hidden" name="phone" value="${esc(s.phone ?? '')}">
<label for="code">Código que chegou no seu celular</label>
<input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus>
<button type="submit">Vincular à Alexa</button></form>
<form method="post" action="${esc(action)}">${hidden}<input type="hidden" name="step" value="restart">
<button class="link" type="submit">Usar outro número</button></form>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Vincular à Alexa — Bora Marca</title>
<style>${css}</style></head><body><main>
<img class="logo" src="${logo}" alt="Bora Marca">
<h1>Vincular à Alexa</h1>
<p>Entre com o mesmo celular que você usa no app Bora Marca.</p>
<div class="card">${body}</div>
<small>A Alexa vai poder ler sua agenda do dia e responder às decisões por você.</small>
</main></body></html>`;
}
