'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { PLAN_LABELS, routes, type SalonPlanResponse } from '@boramarca/shared';
import { AccountEmail } from './AccountEmail';
import { useSession } from './PanelShell';
import { Subscription } from './Subscription';
import { Async, btnPrimary, card, errorText, Icon, PageHeader, useLoad } from './ui';

/** Subscription (docs/COBRANCA.md), current plan, usage and Kit Balcão interest. */
export function PlanPage() {
  const { api } = useSession();
  const plan = useLoad(() => api.call(routes.salon.plan), []);
  return (
    <>
      <PageHeader title="Plano" />
      <Subscription />
      <AccountEmail />
      <Async state={plan}>{(p) => <Plan plan={p} onKitSent={() => void plan.reload()} />}</Async>
    </>
  );
}

function Plan({ plan: p, onKitSent }: { plan: SalonPlanResponse; onKitSent: () => void }) {
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function interest() {
    setBusy(true);
    setError(undefined);
    try {
      await api.call(routes.salon.kitLead, { body: { note: 'Interesse pelo painel web' } });
      onKitSent();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-lg">
      <div className="grid gap-lg lg:grid-cols-[3fr_2fr]">
        <section className={`${card} p-xl`}>
          <h2 className="text-body-small font-semibold text-text-muted">Seu plano atual</h2>
          <div className="mt-lg flex flex-wrap items-center gap-xl">
            <span className="grid size-16 place-items-center rounded-md bg-surface-alt text-primary-text">
              <Icon name="card" className="size-8" />
            </span>
            <div className="flex-1">
              <p className="text-display text-text">{PLAN_LABELS[p.plan]}</p>
              <p className="text-body text-text-muted">
                {p.activeProfessionals}{' '}
                {p.activeProfessionals === 1 ? 'profissional ativo' : 'profissionais ativos'}
              </p>
            </div>
          </div>
        </section>
        <section className={`${card} p-xl`}>
          <h2 className="text-body-small font-semibold text-text-muted">Uso neste mês</h2>
          <dl className="mt-lg space-y-md">
            {(
              [
                ['calendar', 'Agendamentos', p.usage.appointmentsThisMonth],
                ['chat', 'Mensagens', p.usage.messagesThisMonth],
                ['sparkle', 'Decisões da IA', p.usage.decisionsThisMonth],
              ] as const
            ).map(([icon, label, n]) => (
              <div key={label} className="flex items-center gap-md">
                <Icon name={icon} className="size-6 text-text" />
                <dt className="flex-1 text-body text-text">{label}</dt>
                <dd className="text-heading text-text">{n.toLocaleString('pt-BR')}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="grid items-center gap-xl overflow-hidden rounded-lg bg-surface-alt p-xl md:grid-cols-[2fr_3fr]">
        <div className="mx-auto w-full max-w-sm">
          <Image
            src="/landing/05-kit-voz-completo-1536.png"
            alt="Celular no Modo Balcão ao lado de uma caixa de som Bluetooth"
            width={1536}
            height={1024}
            sizes="24rem"
            className="h-auto w-full"
          />
        </div>
        <div>
          <span className="rounded-pill bg-accent px-md py-xs text-body-small font-bold text-on-accent">
            Kit Balcão
          </span>
          <h2 className="mt-md text-title text-text">Seu assistente, sempre por perto</h2>
          <p className="mt-xs text-body text-text-muted">
            Celular + caixa de som para o seu espaço.
          </p>
          {p.kitInterestSent ? (
            <p
              role="status"
              className="mt-lg inline-flex items-center gap-sm rounded-md bg-success px-lg py-md text-body-small font-semibold text-on-success"
            >
              <Icon name="check" /> Recebemos seu interesse. Nosso time vai falar com você.
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={`${btnPrimary} mt-lg`}
              onClick={() => void interest()}
            >
              {busy ? 'Enviando…' : 'Tenho interesse'}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-sm text-body-small text-danger">
              {error}
            </p>
          )}
        </div>
      </section>

      <Link
        href="/contato"
        className={`${card} flex items-center gap-lg p-xl hover:bg-surface-alt`}
      >
        <Icon name="chat" className="size-7 text-text" />
        <span className="flex-1">
          <span className="block text-heading text-text">Dúvidas sobre seu plano?</span>
          <span className="text-body-small text-text-muted">
            Fale com o nosso time. Estamos aqui para ajudar.
          </span>
        </span>
        <Icon name="right" />
      </Link>
    </div>
  );
}
