/* global document */
// Owner panel screenshots at 1366 px with the local API + demo seed (Marina, Espaço Aurora).
// Usage: API on :3335, `next start -p 3010` built with NEXT_PUBLIC_API_URL=http://localhost:3335,
// then `node components/painel/capture-painel.mjs [baseUrl] [--answer]`.
// --answer also answers the first pending decision in the sidebar ("Sim").
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3010';
const answer = process.argv.includes('--answer');
const out = fileURLToPath(new URL('../../docs/capturas-d3/', import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${base}/painel`);
await page.getByLabel('Seu WhatsApp').fill('11900000001');
await page.getByRole('button', { name: 'Receber código' }).click();
await page.getByLabel('Código de 6 dígitos').fill('123456');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.getByRole('heading', { name: 'Agenda da equipe' }).waitFor();
await page.locator('article').first().waitFor();
await page.screenshot({ path: `${out}12-hoje-dia.png`, fullPage: true });

if (answer) {
  await page.getByRole('button', { name: 'Sim' }).first().click();
  await page.getByRole('status').filter({ hasText: /\w/ }).first().waitFor();
  console.log('Decisão respondida:', await page.locator('aside [role=status]').first().innerText());
  await page.screenshot({ path: `${out}12-hoje-decisao-respondida.png`, fullPage: true });
}

await page.getByRole('button', { name: 'Semana', exact: true }).click();
await page.getByRole('table', { name: /semana/ }).waitFor();
await page.screenshot({ path: `${out}12-hoje-semana.png`, fullPage: true });

for (const [path, name, wait] of [
  ['/painel/resultados', '13-resultados', 'Ocupação por profissional'],
  ['/painel/equipe', '14-equipe', 'Sua equipe'],
  ['/painel/clientes', '15-clientes', 'Clientes'],
  ['/painel/plano', '16-plano', 'Seu plano atual'],
]) {
  await page
    .getByRole('link', { name: name.split('-')[1].replace(/^./, (c) => c.toUpperCase()) })
    .click();
  await page.waitForURL(`**${path}`);
  await page.getByRole('heading', { name: wait, exact: true }).first().waitFor();
  await page.waitForLoadState('networkidle');
  if (path === '/painel/equipe')
    await page.getByRole('button', { name: 'Detalhes' }).first().click();
  if (path === '/painel/clientes') await page.locator('tbody th button').first().click();
  await page.waitForFunction(
    () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(() =>
    Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
  );
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  console.log(`${path} ok${overflow ? ' (rolagem horizontal!)' : ''}`);
}

// Tablet: same session, Hoje and Clientes at 1024 px (sidebar becomes a top bar below 1024).
await page.setViewportSize({ width: 1000, height: 1300 });
for (const [path, name] of [
  ['/painel', 'tablet-1000-hoje'],
  ['/painel/clientes', 'tablet-1000-clientes'],
]) {
  await page.goto(base + path);
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  console.log(`${path} 1000px ok${overflow ? ' (rolagem horizontal!)' : ''}`);
}

await browser.close();
if (errors.length) {
  console.error('Erros na página:', errors);
  process.exit(1);
}
