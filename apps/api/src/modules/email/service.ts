// Optional e-mail of the professional: single-use confirmation link (24 h, only its sha256 is
// stored), welcome mail on confirmation. No other mail goes to an unconfirmed address.
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  API_PREFIX,
  EMAIL_CONFIRM_TTL_HOURS,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  routes,
  type EmailConfirmStatus,
} from '@boramarca/shared';
import { professionals } from '../../db/schema';
import type { Core } from '../../lib/core';
import { AppError, notFound } from '../../lib/errors';

const TTL_MS = EMAIL_CONFIRM_TTL_HOURS * 3600_000;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function sendConfirmation(core: Core, p: { id: string; name: string; email: string }) {
  const token = randomBytes(32).toString('base64url');
  await core.db
    .update(professionals)
    .set({
      emailTokenHash: tokenHash(token),
      emailTokenExpiresAt: new Date(core.now().getTime() + TTL_MS),
    })
    .where(eq(professionals.id, p.id));
  const base = core.config.PUBLIC_API_BASE_URL.replace(/\/$/, '');
  const url = `${base}${API_PREFIX}${routes.email.confirm.path}?token=${token}`;
  await core.mail.send({
    to: p.email,
    ...core.mailTemplates.confirmEmail({ name: p.name, url, ttlHours: EMAIL_CONFIRM_TTL_HOURS }),
  });
}

async function load(core: Core, professionalId: string) {
  const [p] = await core.db
    .select()
    .from(professionals)
    .where(eq(professionals.id, professionalId));
  if (!p) throw notFound('Profissional');
  return p;
}

/** PATCH /me { email }: null removes it; a new address starts the confirmation again. */
export async function setEmail(core: Core, professionalId: string, raw: string | null) {
  const email = raw?.trim().toLowerCase() || null;
  const p = await load(core, professionalId);
  if (email === p.email) return;
  await core.db
    .update(professionals)
    .set({ email, emailVerifiedAt: null, emailTokenHash: null, emailTokenExpiresAt: null })
    .where(eq(professionals.id, professionalId));
  if (email) await sendConfirmation(core, { id: p.id, name: p.name, email });
}

/** POST /me/email/resend. */
export async function resendConfirmation(core: Core, professionalId: string) {
  const p = await load(core, professionalId);
  if (!p.email) throw new AppError(409, 'NO_EMAIL', 'Cadastre um e-mail primeiro');
  if (p.emailVerifiedAt)
    throw new AppError(409, 'EMAIL_ALREADY_VERIFIED', 'Este e-mail já está confirmado');
  // The last link was sent at expiresAt - TTL.
  const sentAt = p.emailTokenExpiresAt ? p.emailTokenExpiresAt.getTime() - TTL_MS : 0;
  const wait = Math.ceil(
    (sentAt + EMAIL_RESEND_COOLDOWN_SECONDS * 1000 - core.now().getTime()) / 1000,
  );
  if (wait > 0)
    throw new AppError(
      429,
      'RATE_LIMITED',
      'Acabamos de enviar. Espere um pouco e tente de novo.',
      {
        retryAfterSeconds: wait,
      },
    );
  await sendConfirmation(core, { id: p.id, name: p.name, email: p.email });
}

/** GET /email/confirm: the token works once, for 24 h, and only for the address it was sent to. */
export async function confirmEmail(core: Core, token: string): Promise<EmailConfirmStatus> {
  if (!token) return 'invalido';
  const [p] = await core.db
    .select()
    .from(professionals)
    .where(eq(professionals.emailTokenHash, tokenHash(token)));
  if (!p?.email) return 'invalido';
  if (!p.emailTokenExpiresAt || p.emailTokenExpiresAt <= core.now()) return 'expirado';
  const [done] = await core.db
    .update(professionals)
    .set({ emailVerifiedAt: core.now(), emailTokenHash: null, emailTokenExpiresAt: null })
    .where(eq(professionals.emailTokenHash, tokenHash(token)))
    .returning({ id: professionals.id });
  // Two clicks at once: only the first one confirms (and sends the welcome mail).
  if (!done) return 'invalido';
  await core.mail.send({ to: p.email, ...core.mailTemplates.welcome({ name: p.name }) });
  return 'ok';
}
