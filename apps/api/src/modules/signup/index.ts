// Free sign-up and login by a 6-digit code sent by E-MAIL (works while there is no SMS):
// POST /auth/signup/{request,verify} and /auth/email-code/{request,verify}. docs/COBRANCA.md.
// Codes live in Redis (hash only, TTL, tries); same limits as the SMS code (modules/auth/otp.ts).
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  EMAIL_CODE_RESEND_SECONDS,
  EMAIL_CODE_TTL_SECONDS,
  routes,
  TRIAL_DAYS,
  type SignupRequestBody,
} from '@boramarca/shared';
import { professionals, salons } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { maskEmail } from '../../lib/mail/mailer';
import { hashPassword, verifyPassword } from '../auth/password';
import { route } from '../../lib/route';
import {
  DEV_OTP,
  OTP_FAILURE_WINDOW_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_FAILURES_PER_WINDOW,
} from '../auth/otp';

type Kind = 'signup' | 'login' | 'reset';
/** What the sign-up code keeps until verify: the form, with the password already hashed. */
type PendingSignup = Omit<SignupRequestBody, 'password'> & { passwordHash?: string };
const DECOY_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.br', 'icloud.com'];
const invalid = () => new AppError(400, 'OTP_INVALID', 'Código errado. Confira e tente de novo.');
const tooMany = () =>
  new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Muitas tentativas. Peça um novo código.');

export function emailCodes(app: FastifyInstance) {
  const { redis, config } = app;
  const mac = (s: string) => createHmac('sha256', config.JWT_ACCESS_SECRET).update(s).digest('hex');
  const key = (kind: Kind, dest: string) => `emailcode:${kind}:${mac(dest)}`;
  const codeHash = (kind: Kind, dest: string, code: string) => mac(`${kind}:${dest}:${code}`);

  /**
   * Resend cooldown per destination, applied BEFORE knowing whether the account exists, so a
   * 429 never tells a real account from an unknown one.
   */
  async function cooldown(kind: Kind, dest: string) {
    const k = `${key(kind, dest)}:cool`;
    if (await redis.set(k, '1', 'EX', EMAIL_CODE_RESEND_SECONDS, 'NX')) return;
    const retryAfterSeconds = Math.max(1, await redis.ttl(k));
    throw new AppError(
      429,
      'OTP_TOO_SOON',
      `Espere ${retryAfterSeconds}s para pedir outro código`,
      {
        retryAfterSeconds,
      },
    );
  }

  async function issue(kind: Kind, dest: string, payload: object = {}) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const k = key(kind, dest);
    await redis
      .multi()
      .del(k)
      .hset(k, {
        hash: codeHash(kind, dest, code),
        attempts: '0',
        payload: JSON.stringify(payload),
      })
      .expire(k, EMAIL_CODE_TTL_SECONDS)
      .exec();
    return code;
  }

  /** Failure budget per destination (codes and passwords), same window as the SMS code. */
  async function budget(dest: string) {
    const failKey = `otp:fail:${createHmac('sha256', config.JWT_ACCESS_SECRET).update(dest).digest('hex')}`;
    if ((Number(await redis.get(failKey)) || 0) >= OTP_MAX_FAILURES_PER_WINDOW) throw tooMany();
    return async () => {
      if ((await redis.incr(failKey)) === 1)
        await redis.expire(failKey, OTP_FAILURE_WINDOW_SECONDS);
    };
  }

  /** Checks and spends the code; returns what was stored with it. Throws pt-BR AppErrors. */
  async function consume<T>(kind: Kind, dest: string, code: string): Promise<T> {
    const fail = await budget(dest);
    const k = key(kind, dest);
    const rec = await redis.hgetall(k);
    if (!rec.hash) {
      await fail();
      throw new AppError(400, 'OTP_EXPIRED', 'Código expirado. Peça um novo.');
    }
    // Counted before comparing (atomic): parallel tries cannot pass the limit.
    const attempts = await redis.hincrby(k, 'attempts', 1);
    if (attempts > OTP_MAX_ATTEMPTS) throw tooMany();
    const dev = config.NODE_ENV !== 'production' && code === DEV_OTP;
    const ok =
      dev ||
      timingSafeEqual(Buffer.from(rec.hash, 'hex'), Buffer.from(codeHash(kind, dest, code), 'hex'));
    if (!ok) {
      await fail();
      throw new AppError(400, 'OTP_INVALID', 'Código errado. Confira e tente de novo.', {
        attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attempts),
      });
    }
    // Only one of two parallel right answers wins.
    if (!(await redis.del(k))) throw invalid();
    return JSON.parse(rec.payload ?? '{}') as T;
  }

  /** Same shape for a phone with no account: a stable fake mask, and nothing is sent. */
  function decoy(phone: string) {
    const h = Buffer.from(mac(`decoy:${phone}`), 'hex');
    return `${'abcdefghijklmnopqrstuvwxyz'[h[0]! % 26]}***@${DECOY_DOMAINS[h[1]! % DECOY_DOMAINS.length]}`;
  }

  return { cooldown, issue, consume, decoy, budget };
}

const signup: FastifyPluginAsync = async (app) => {
  const r = routes.signup;
  const { db } = app;
  const core = () => app.messaging.core;
  const codes = emailCodes(app);
  const limit = {
    config: { rateLimit: { max: app.config.RATE_LIMIT_OTP_MAX, timeWindow: '10 minutes' } },
  };
  const answer = (email: string) => ({
    ok: true as const,
    expiresInSeconds: EMAIL_CODE_TTL_SECONDS,
    retryAfterSeconds: EMAIL_CODE_RESEND_SECONDS,
    email,
  });
  const ttlMinutes = EMAIL_CODE_TTL_SECONDS / 60;

  /** One account per phone, and per confirmed e-mail. */
  const taken = async (phone: string, email: string) =>
    (
      await db
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          or(
            eq(professionals.phone, phone),
            and(eq(professionals.email, email), isNotNull(professionals.emailVerifiedAt)),
          ),
        )
        .limit(1)
    ).length > 0;

  route(
    app,
    r.request,
    async (req) => {
      const b = req.body;
      await codes.cooldown('signup', b.email);
      const { mail, mailTemplates } = core();
      if (await taken(b.phone, b.email)) {
        await mail.send({ to: b.email, ...mailTemplates.accountExists() });
      } else {
        const { password, ...rest } = b;
        const pending: PendingSignup = {
          ...rest,
          ...(password && { passwordHash: await hashPassword(password) }),
        };
        const code = await codes.issue('signup', b.email, pending);
        await mail.send({
          to: b.email,
          ...mailTemplates.accessCode({ code, ttlMinutes, purpose: 'signup' }),
        });
      }
      return answer(maskEmail(b.email));
    },
    limit,
  );

  route(
    app,
    r.verify,
    async (req) => {
      const b = await codes.consume<PendingSignup>('signup', req.body.email, req.body.code);
      const exists = () =>
        new AppError(
          409,
          'ACCOUNT_EXISTS',
          'Já existe uma conta com estes dados. Entre pelo login.',
        );
      if (await taken(b.phone, b.email)) throw exists();
      const now = app.now();
      const p = await db.transaction(async (tx) => {
        const [s] = await tx
          .insert(salons)
          .values({
            name: b.salonName,
            trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
          })
          .returning();
        const [created] = await tx
          .insert(professionals)
          .values({
            salonId: s!.id,
            role: 'owner',
            name: b.name,
            phone: b.phone,
            professions: [b.profession],
            email: b.email,
            emailVerifiedAt: now,
            phoneVerifiedAt: null,
            passwordHash: b.passwordHash ?? null,
          })
          .onConflictDoNothing({ target: professionals.phone })
          .returning();
        if (!created) throw exists();
        return created;
      });
      await core()
        .mail.send({ to: b.email, ...core().mailTemplates.welcome({ name: b.name }) })
        .catch((err: unknown) => req.log.error({ err }, 'welcome mail not queued'));
      // isNewUser: the app still asks services and hours (name and profession come prefilled).
      return {
        ...app.issueTokens({ professionalId: p.id, salonId: p.salonId, role: p.role }),
        isNewUser: true,
      };
    },
    limit,
  );

  route(
    app,
    r.emailCodeRequest,
    async (req) => {
      const { phone } = req.body;
      await codes.cooldown('login', phone);
      const [p] = await db
        .select({ email: professionals.email, verified: professionals.emailVerifiedAt })
        .from(professionals)
        .where(eq(professionals.phone, phone));
      if (!p?.email || !p.verified) return answer(codes.decoy(phone));
      const code = await codes.issue('login', phone);
      const { mail, mailTemplates } = core();
      await mail.send({
        to: p.email,
        ...mailTemplates.accessCode({ code, ttlMinutes, purpose: 'login' }),
      });
      return answer(maskEmail(p.email));
    },
    limit,
  );

  route(
    app,
    r.emailCodeVerify,
    async (req) => {
      const { phone, code } = req.body;
      await codes.consume('login', phone, code);
      const [p] = await db.select().from(professionals).where(eq(professionals.phone, phone));
      // The e-mail may have been un-confirmed since the code went out.
      if (!p?.emailVerifiedAt) throw invalid();
      return {
        ...app.issueTokens({ professionalId: p.id, salonId: p.salonId, role: p.role }),
        isNewUser: false,
      };
    },
    limit,
  );
  /** Owners whose CONFIRMED e-mail is this one (sign-up keeps it to one; oldest first). */
  const byEmail = (email: string) =>
    db
      .select()
      .from(professionals)
      .where(and(eq(professionals.email, email), isNotNull(professionals.emailVerifiedAt)))
      .orderBy(professionals.createdAt);
  const tokens = (p: typeof professionals.$inferSelect) => ({
    ...app.issueTokens({ professionalId: p.id, salonId: p.salonId, role: p.role }),
    isNewUser: false,
  });

  route(
    app,
    r.passwordLogin,
    async (req) => {
      const { email, password } = req.body;
      const fail = await codes.budget(email);
      const rows = (await byEmail(email)).filter((p) => p.passwordHash);
      for (const p of rows) if (await verifyPassword(password, p.passwordHash!)) return tokens(p);
      // Same work with no account, so the timing does not tell whether the e-mail exists.
      if (rows.length === 0) await hashPassword(password);
      await fail();
      throw new AppError(400, 'INVALID_CREDENTIALS', 'E-mail ou senha errados.');
    },
    limit,
  );

  route(
    app,
    r.passwordResetRequest,
    async (req) => {
      const { email } = req.body;
      await codes.cooldown('reset', email);
      if ((await byEmail(email)).length > 0) {
        const code = await codes.issue('reset', email);
        const { mail, mailTemplates } = core();
        await mail.send({
          to: email,
          ...mailTemplates.accessCode({ code, ttlMinutes, purpose: 'password' }),
        });
      }
      return answer(maskEmail(email));
    },
    limit,
  );

  route(
    app,
    r.passwordReset,
    async (req) => {
      const { email, code, password } = req.body;
      await codes.consume('reset', email, code);
      const [p] = await byEmail(email);
      if (!p) throw invalid();
      await db
        .update(professionals)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(professionals.id, p.id));
      return tokens(p);
    },
    limit,
  );
};

export default signup;
