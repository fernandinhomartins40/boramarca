// `pnpm --filter @boramarca/api email:preview`: writes every e-mail template, rendered with sample
// data, to apps/api/email-previews/ (git-ignored) for a visual check in the browser.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mailTemplates } from '../src/lib/mail/templates';

const out = fileURLToPath(new URL('../email-previews/', import.meta.url));
// PREVIEW_SITE_URL=http://localhost:3000 shows the logo from `pnpm --filter @boramarca/web dev`.
const t = mailTemplates({
  site: process.env.PREVIEW_SITE_URL ?? 'https://boramarca.com.br',
  support: 'contato@boramarca.com.br',
});
const now = new Date('2030-03-14T12:30:00Z');

const samples = {
  '1-confirmar-email': t.confirmEmail({
    name: 'Marina Costa',
    url: 'https://api.boramarca.com.br/v1/email/confirm?token=exemplo-de-token',
    ttlHours: 24,
  }),
  '2-boas-vindas': t.welcome({ name: 'Marina Costa' }),
  '3-conta-excluida': t.accountDeleted({ name: 'Marina Costa', completedAt: now }),
  '4-lead-time': t.newLead({
    name: 'Joana <b>Souza</b>',
    phone: '+5511987654321',
    profession: 'manicure',
    message: 'Oi! Atendo sozinha e queria entender como a IA responde meus clientes.',
    source: 'site_contato',
    receivedAt: now,
  }),
};

mkdirSync(out, { recursive: true });
for (const [name, mail] of Object.entries(samples)) {
  writeFileSync(`${out}${name}.html`, mail.html);
  writeFileSync(`${out}${name}.txt`, `Assunto: ${mail.subject}\n\n${mail.text}\n`);
}
console.log(`${Object.keys(samples).length} e-mails em ${out}`);
