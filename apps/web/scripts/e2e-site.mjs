/* global document -- used inside page.evaluate (runs in the browser) */
// Keyboard-only run of the FAQ, the contact form and the account deletion page against a local
// API (outside production the API accepts the dev code 123456). Never use the demo account.
// Usage: API on :3333, next start on :3000, then `node scripts/e2e-site.mjs <test phone E.164>`
// (SITE_URL and API_URL override the two addresses).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const base = process.env.SITE_URL ?? 'http://localhost:3000';
const api = `${process.env.API_URL ?? 'http://localhost:3333'}/v1`;
const phone = process.argv[2];
assert.ok(phone && phone !== '+5511900000001', 'pass a fresh test phone (not the demo one)');
const local = phone.replace(/^\+55/, '');

// NO_CORS=1 works around an API whose CORS still lacks DELETE (see docs/pendencias/C5.md).
const browser = await chromium.launch({
  channel: 'chrome',
  args: process.env.NO_CORS ? ['--disable-web-security'] : [],
});
const page = await browser.newPage();
const tabTo = async (selector, max = 60) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
};

// FAQ: second question opens with Enter.
await page.goto(base + '/');
await tabTo('#duvidas details:nth-of-type(2) summary', 120);
await page.keyboard.press('Enter');
assert.equal(await page.locator('#duvidas details').nth(1).getAttribute('open'), '');
console.log('OK FAQ opens with keyboard');

// Contact: empty submit focuses the first invalid field, then a real submit.
await page.goto(base + '/contato');
await tabTo('button[type=submit]');
await page.keyboard.press('Enter');
assert.equal(await page.evaluate(() => document.activeElement?.id), 'lead-name');
assert.equal(await page.getAttribute('#lead-name', 'aria-invalid'), 'true');
assert.equal(await page.getAttribute('#lead-name', 'aria-describedby'), 'lead-name-error');
console.log('OK contact errors are announced and focused');
await page.keyboard.type('Teste C5');
await page.keyboard.press('Tab');
await page.keyboard.type(local);
await page.keyboard.press('Tab');
await page.keyboard.press('ArrowDown'); // first profession
await page.keyboard.press('Tab');
await page.keyboard.type('Lead de teste do agente C5');
await tabTo('button[type=submit]');
await page.keyboard.press('Enter');
await page.getByText('Recebemos sua mensagem.').waitFor({ timeout: 15000 });
console.log('OK lead sent');

// Account deletion, keyboard only. A number without an account is refused and nothing is created.
const startDeletion = async () => {
  await page.goto(base + '/excluir-conta');
  await tabTo('#del-phone');
  await page.keyboard.type(local);
  await page.keyboard.press('Enter');
  await page.locator('#del-code').waitFor({ timeout: 15000 });
  await page.keyboard.type('123456');
  await page.keyboard.press('Enter');
};
const post = (path, body) =>
  fetch(api + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
    return r.json();
  });
await startDeletion();
await page.getByText('Não existe conta com este número.').waitFor({ timeout: 15000 });
assert.ok(await page.getByText('Passo 1 de 4').isVisible());
await page.screenshot({
  path: fileURLToPath(new URL('../docs/capturas-d3/excluir-conta-sem-conta.png', import.meta.url)),
});
console.log('OK unknown number: "Não existe conta com este número", no account created');

// Sign up the test number the app's way (login code), then delete it from the site.
await post('/auth/otp/request', { phone, purpose: 'login' });
const created = await post('/auth/otp/verify', { phone, code: '123456' });
assert.equal(created.isNewUser, true, 'the refused attempt must not have created the account');
await startDeletion();
await page.getByText('Passo 3 de 4').waitFor({ timeout: 15000 });
await tabTo('input[type=checkbox]');
await page.keyboard.press('Space');
await page.keyboard.press('Enter');
// Outside production the dev code leaves the app's login code pending, so the page's first code
// is not spent and the API asks to wait before a new one: wait as a person would, then retry.
const step4 = page.getByText('Passo 4 de 4');
const wait = page.getByRole('alert').filter({ hasText: /Espere \d+s/ });
await step4.or(wait).waitFor({ timeout: 15000 });
if (await wait.isVisible()) {
  const s = Number((await wait.innerText()).match(/(\d+)s/)[1]);
  console.log(`(API pediu ${s}s antes de outro código; aguardando)`);
  await page.waitForTimeout((s + 1) * 1000);
  await page.getByRole('button', { name: 'Enviar código de exclusão' }).focus();
  await page.keyboard.press('Enter');
}
await step4.waitFor({ timeout: 15000 });
await page.keyboard.type('123456');
await page.keyboard.press('Enter');
await page.getByText('Conta excluída.').waitFor({ timeout: 20000 });
console.log('OK account deleted');
await browser.close();
