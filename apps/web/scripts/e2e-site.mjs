/* global document -- used inside page.evaluate (runs in the browser) */
// Keyboard-only run of the FAQ, the contact form and the account deletion page against a local
// API (outside production the API accepts the dev code 123456). Never use the demo account.
// Usage: API on :3333, next start on :3000, then `node scripts/e2e-site.mjs <test phone E.164>`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = 'http://localhost:3000';
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

// Account deletion, keyboard only.
await page.goto(base + '/excluir-conta');
await tabTo('#del-phone');
await page.keyboard.type(local);
await page.keyboard.press('Enter');
await page.locator('#del-code').waitFor({ timeout: 15000 });
await page.keyboard.type('123456');
await page.keyboard.press('Enter');
await page.getByText('Passo 3 de 4').waitFor({ timeout: 15000 });
await tabTo('input[type=checkbox]');
await page.keyboard.press('Space');
await page.keyboard.press('Enter');
await page.getByText('Passo 4 de 4').waitFor({ timeout: 15000 });
await page.keyboard.type('123456');
await page.keyboard.press('Enter');
await page.getByText('Conta excluída.').waitFor({ timeout: 20000 });
console.log('OK account deleted');
await browser.close();
