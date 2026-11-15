/* global document */
// Owner panel writes against the local API + demo seed (Marina, Espaço Aurora): answer another
// professional's decision, drag an appointment to another time, hit a conflict through the
// keyboard path, filter the waitlist on the server. Screenshots in docs/capturas-d3/.
// Usage: API on :3335, `next start -p 3010` built with NEXT_PUBLIC_API_URL=http://localhost:3335,
// a pending decision of a professional other than Marina, then
// `node components/painel/e2e-painel.mjs [baseUrl]`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:3010';
const out = fileURLToPath(new URL('../../docs/capturas-d3/', import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: `${out}${name}.png`, fullPage: true });

await page.goto(`${base}/painel`);
await page.getByLabel('Seu WhatsApp').fill('11900000001');
await page.getByRole('button', { name: 'Receber código' }).click();
await page.getByLabel('Código de 6 dígitos').fill('123456');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.getByRole('heading', { name: 'Agenda da equipe' }).waitFor();
await page.locator('article[draggable=true]').first().waitFor();

// 1. A decision of another professional is answered from the side list.
const other = page.locator('aside article').filter({ hasText: /Agenda de (?!Marina)/ });
assert.ok(await other.count(), 'seed a pending decision of another professional first');
assert.equal(await page.getByText(/Quem responde é/).count(), 0);
const answered = page.waitForResponse((r) => /\/salon\/decisions\/[^/]+\/answer$/.test(r.url()));
await other.first().getByRole('button', { name: 'Não' }).click();
assert.equal((await answered).status(), 200);
const done = await page.locator('aside [role=status]').first().innerText();
console.log('OK decisão de outro profissional respondida:', done);
await shot('d3-decisao-outro-profissional');

// 2. Drag a card one hour up in its column; the dialog confirms before saving.
const card = page.locator('article[draggable=true]').filter({ hasText: 'Pedro Martins' });
const box = await card.boundingBox();
const before = (await card.locator('p').first().innerText()).trim().slice(0, 5);
await page.mouse.move(box.x + box.width / 2, box.y + 10);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 5 });
await page.mouse.move(box.x + box.width / 2, box.y + 10 - 72, { steps: 5 });
await page.mouse.up();
const dialog = page.getByRole('dialog', { name: /Remarcar Pedro Martins/ });
await dialog.waitFor();
const to = await dialog.getByLabel('Novo horário').inputValue();
console.log(`OK arrastar abre a confirmação: ${before} → ${to}`);
await shot('d3-remarcar-confirmacao');
const moved = page.waitForResponse((r) =>
  /\/salon\/appointments\/[^/]+\/reschedule$/.test(r.url()),
);
await dialog.getByRole('button', { name: /^Remarcar para/ }).click();
assert.equal((await moved).status(), 200);
await page.getByText(`Pedro Martins remarcado para ${to}.`).waitFor();
// The reloaded agenda shows the card at the new time.
await card.filter({ hasText: to }).waitFor({ timeout: 15000 });
console.log('OK remarcado e agenda recarregada');
await shot('d3-remarcado');

// 3. Keyboard path: the card button opens the same dialog; a taken time shows the conflict.
const tiago = page.getByRole('button', { name: /^Remarcar Tiago Rocha/ });
await tiago.focus();
await page.keyboard.press('Enter');
const kb = page.getByRole('dialog', { name: /Remarcar Tiago Rocha/ });
await kb.waitFor();
const aline = (
  await page
    .locator('article[draggable=true]')
    .filter({ hasText: 'Aline Pereira' })
    .locator('p')
    .first()
    .innerText()
)
  .trim()
  .slice(0, 5);
await kb.getByLabel('Novo horário').fill(aline);
await kb.getByRole('button', { name: /^Remarcar para/ }).press('Enter');
const alert = kb.getByRole('alert');
await alert.waitFor();
console.log('OK conflito mostrado:', await alert.innerText());
await shot('d3-remarcar-conflito');
await page.keyboard.press('Escape');
await kb.waitFor({ state: 'hidden' });

// 4. Clients: the waitlist filter runs on the server.
await page.getByRole('link', { name: 'Clientes' }).click();
await page.getByRole('heading', { name: 'Clientes', exact: true }).waitFor();
await page.waitForLoadState('networkidle');
const filtered = page.waitForRequest((r) => r.url().includes('onWaitlist=true'));
await page.getByRole('button', { name: 'Lista de espera', exact: true }).click();
await filtered;
await page.waitForLoadState('networkidle');
console.log('OK filtro Lista de espera no servidor (onWaitlist=true)');
await shot('d3-clientes-lista-de-espera');

// 5. Results show the appointments done in the month.
await page.getByRole('link', { name: 'Resultados' }).click();
await page.getByRole('heading', { name: 'Atendimentos concluídos' }).waitFor();
await page.waitForLoadState('networkidle');
await shot('d3-resultados');
console.log('OK resultados com atendimentos concluídos');

const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
assert.ok(!overflow, 'no horizontal scroll');
await browser.close();
if (errors.length) {
  console.error('Erros na página:', errors);
  process.exit(1);
}
