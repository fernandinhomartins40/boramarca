import type { Metadata } from 'next';
import Link from 'next/link';
import { EmailConfirmStatus } from '@boramarca/shared';
import { btn, container } from '@/components/site/ui';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Confirmação de e-mail',
  robots: { index: false, follow: false },
};

const COPY: Record<EmailConfirmStatus, { title: string; text: string }> = {
  ok: {
    title: 'E-mail confirmado!',
    text: 'Pronto. A partir de agora você recebe por e-mail os avisos importantes da sua conta. Pode voltar para o app.',
  },
  expirado: {
    title: 'Este link expirou',
    text: 'O link de confirmação vale por 24 horas. No app, abra Ajustes → Conta e toque em "Reenviar" para receber um novo.',
  },
  invalido: {
    title: 'Este link não vale mais',
    text: 'Ele já foi usado ou foi trocado por um mais novo. Confira em Ajustes → Conta, no app, se o seu e-mail já aparece como confirmado.',
  },
};

/** Where the confirmation link from the e-mail lands (GET /v1/email/confirm redirects here). */
export default async function EmailConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const parsed = EmailConfirmStatus.safeParse((await searchParams).status);
  const status = parsed.success ? parsed.data : 'invalido';
  const c = COPY[status];
  return (
    <main id="conteudo" className={`${container} py-xxxl`}>
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-xl text-center">
        <h1 className="text-display text-text">{c.title}</h1>
        <p className="mt-lg text-body text-text-muted" role={status === 'ok' ? 'status' : 'alert'}>
          {c.text}
        </p>
        <div className="mt-xl flex flex-wrap justify-center gap-md">
          <Link href="/" className={`${btn.base} ${btn.primary}`}>
            Ir para o site
          </Link>
          {status !== 'ok' && (
            <a href={`mailto:${SUPPORT_EMAIL}`} className={`${btn.base} ${btn.outline}`}>
              Falar com o suporte
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
