// Transactional e-mail through Velomail (the owner's own mail server; docs/OPERACAO.md, "E-mail
// transacional"). Mails go through the BullMQ queue `email` (attempts + backoff); the transport is
// swappable so tests never reach the network.
import type { Job } from 'bullmq';
import type { Config } from '../../config';
import type { Log } from '../core';
import type { Queues } from '../queues';

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}
export type Mail = MailContent & { to: string };

export interface MailTransport {
  deliver(mail: Mail): Promise<void>;
}

/** `marina@x.com` → `m***@x.com` (logs carry no personal data). */
export const maskEmail = (to: string) => to.replace(/^(.).*@/, '$1***@');

/**
 * Velomail HTTP API. Without VELOMAIL_API_KEY nothing leaves the process: the mail is only logged
 * (the body, which may carry a confirmation link, only outside production).
 */
export function velomailTransport(
  config: Config,
  log: Log,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): MailTransport {
  return {
    async deliver(mail) {
      const to = maskEmail(mail.to);
      if (!config.VELOMAIL_API_KEY) {
        log.warn(
          {
            to,
            subject: mail.subject,
            ...(config.NODE_ENV !== 'production' && { body: mail.text }),
          },
          'e-mail NÃO enviado: VELOMAIL_API_KEY vazio',
        );
        return;
      }
      const res = await fetchImpl(config.VELOMAIL_API_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.VELOMAIL_API_KEY}`,
          'content-type': 'application/json',
        },
        // No click tracking: it would rewrite the links, and the confirmation link carries a token.
        body: JSON.stringify({
          // Velomail's send route takes a bare address; the display name is a setting of the Velomail account.
          from: /<([^>]+)>/.exec(config.MAIL_FROM)?.[1] ?? config.MAIL_FROM,
          reply_to: config.MAIL_REPLY_TO,
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          tracking_enabled: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok)
        throw new Error(`Velomail respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
      log.info({ to, subject: mail.subject }, 'e-mail enviado');
    },
  };
}

/** Logs only (default under NODE_ENV=test when no transport is given). */
export const nullTransport = (log: Log): MailTransport => ({
  async deliver(mail) {
    log.info({ to: maskEmail(mail.to), subject: mail.subject }, 'e-mail (teste) descartado');
  },
});

export function createMailer(queues: Queues, transport: MailTransport) {
  return {
    /** Queues the mail: 6 attempts with exponential backoff (2 s … ~1 min); never throws on send. */
    async send(mail: Mail) {
      // Subject is a header: no line breaks from user data.
      const subject = mail.subject.replace(/[\r\n]+/g, ' ').trim();
      await queues.queues.email.add(
        'mail',
        { ...mail, subject },
        {
          attempts: 6,
          backoff: { type: 'exponential', delay: 2000 },
          // The job carries an address and a body: drop it as soon as it is done.
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      );
    },
    process: (job: Job<Mail>) => transport.deliver(job.data),
  };
}
export type Mailer = ReturnType<typeof createMailer>;
