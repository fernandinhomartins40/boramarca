'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  BILLING_CYCLE_LABELS,
  MAX_SEATS,
  PLAN_LABELS,
  planValueCents,
  routes,
  SUBSCRIPTION_STATUS_LABELS,
  SellablePlan,
  SubscribeBody,
  type BillingCycle,
  type BillingSummary,
} from '@boramarca/shared';
import { input } from '@/components/site/ui';
import { fieldErrors } from '@/lib/api';
import { cancelSubscription, changePlan, subscribe, subscriptionHeadline } from './actions';
import { money } from './format';
import { useSession } from './PanelShell';
import { Async, btnOutline, btnPrimary, card, errorText, useLoad } from './ui';

const PLANS = SellablePlan.options;
const dateBr = (d: string) => d.split('-').reverse().join('/');

/** Plano → Assinatura: trial, choose plan/cycle, CPF/CNPJ, subscribe, invoice, history, change, cancel. */
export function Subscription() {
  const { api } = useSession();
  const state = useLoad(() => api.call(routes.billing.get), []);
  return <Async state={state}>{(b) => <Card b={b} onSaved={() => void state.reload()} />}</Async>;
}

function Card({ b, onSaved }: { b: BillingSummary; onSaved: () => void }) {
  const { api, me } = useSession();
  const [plan, setPlan] = useState<SellablePlan>(b.plan === 'premium' ? 'essencial' : b.plan);
  const [cycle, setCycle] = useState<BillingCycle>(b.cycle ?? 'monthly');
  const [seats, setSeats] = useState(b.seats);
  const [cpfCnpj, setCpfCnpj] = useState(b.cpfCnpj ?? '');
  const [email, setEmail] = useState(b.email ?? me.professional.email ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const price = planValueCents(plan, cycle, seats) ?? 0;
  const paused = b.automationPaused;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(undefined);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (b.subscribed)
      return void run(() => changePlan(api, { plan, cycle, seats }), 'Plano trocado.');
    const parsed = SubscribeBody.safeParse({ plan, cycle, seats, cpfCnpj, email });
    setErrors(parsed.success ? {} : fieldErrors(parsed.error));
    if (parsed.success)
      void run(
        () => subscribe(api, parsed.data),
        'Assinatura criada. Abra a fatura para pagar com Pix, boleto ou cartão.',
      );
  };
  const cancel = () => {
    if (!window.confirm('Cancelar a assinatura? A IA atende até o fim do período já pago.')) return;
    void run(() => cancelSubscription(api), 'Assinatura cancelada.');
  };

  return (
    <section className={`${card} mb-lg p-xl`} aria-labelledby="assinatura">
      <div className="flex flex-wrap items-center gap-md">
        <h2 id="assinatura" className="text-heading text-text">
          Assinatura
        </h2>
        <span
          className={`rounded-pill px-md py-xs text-body-small font-bold ${
            paused || b.status === 'past_due'
              ? 'bg-warning text-on-warning'
              : 'bg-surface-alt text-text'
          }`}
        >
          {SUBSCRIPTION_STATUS_LABELS[b.status]}
        </span>
      </div>
      <p className={`mt-sm text-body ${paused ? 'font-semibold text-danger' : 'text-text-muted'}`}>
        {subscriptionHeadline(b)}
      </p>

      {b.subscribed && (
        <dl className="mt-lg grid gap-md sm:grid-cols-3">
          <Fact
            label="Plano"
            value={`${PLAN_LABELS[b.plan]} · ${BILLING_CYCLE_LABELS[b.cycle ?? 'monthly']}`}
          />
          <Fact label="Valor" value={b.valueCents != null ? money(b.valueCents) : '—'} />
          <Fact label="Próximo vencimento" value={b.nextDueDate ? dateBr(b.nextDueDate) : '—'} />
        </dl>
      )}
      {b.openInvoiceUrl && (
        <a
          href={b.openInvoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btnPrimary} mt-lg`}
        >
          Abrir fatura
        </a>
      )}

      {b.exempt ? null : !b.enabled ? (
        <p className="mt-lg text-body-small text-text-muted">
          A assinatura pelo painel ainda não está disponível.{' '}
          <Link href="/contato" className="font-semibold text-primary-text underline">
            Fale com a gente
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={submit} className="mt-xl space-y-lg" noValidate>
          <fieldset>
            <legend className="text-body-small font-semibold text-text">Plano</legend>
            <div className="mt-sm grid gap-md sm:grid-cols-3">
              {PLANS.map((p) => (
                <label
                  key={p}
                  className={`${card} flex cursor-pointer flex-col gap-xs p-lg has-[:checked]:border-primary has-[:checked]:bg-surface-alt`}
                >
                  <span className="flex items-center gap-sm">
                    <input
                      type="radio"
                      name="plan"
                      value={p}
                      checked={plan === p}
                      onChange={() => setPlan(p)}
                    />
                    <span className="text-body font-semibold text-text">{PLAN_LABELS[p]}</span>
                  </span>
                  <span className="text-body-small text-text-muted">
                    {money(planValueCents(p, 'monthly')!)}/mês
                    {p === 'salao' ? ' por profissional' : ''}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-sm text-caption text-text-muted">
              Premium:{' '}
              <Link href="/contato" className="underline">
                fale com a gente
              </Link>
              .
            </p>
          </fieldset>
          <div className="flex flex-wrap gap-lg">
            <fieldset>
              <legend className="text-body-small font-semibold text-text">Ciclo</legend>
              <div className="mt-sm flex gap-sm">
                {(['monthly', 'yearly'] as const).map((c) => (
                  <label
                    key={c}
                    className={`${btnOutline} cursor-pointer has-[:checked]:bg-surface-alt has-[:checked]:font-bold`}
                  >
                    <input
                      type="radio"
                      name="cycle"
                      value={c}
                      checked={cycle === c}
                      onChange={() => setCycle(c)}
                      className="sr-only"
                    />
                    {BILLING_CYCLE_LABELS[c]}
                    {c === 'yearly' ? ' (pague 10, leve 12)' : ''}
                  </label>
                ))}
              </div>
            </fieldset>
            {plan === 'salao' && (
              <label className="text-body-small font-semibold text-text">
                Profissionais
                <input
                  type="number"
                  min={1}
                  max={MAX_SEATS}
                  value={seats}
                  onChange={(e) =>
                    setSeats(Math.min(MAX_SEATS, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className={`${input} w-28`}
                />
              </label>
            )}
          </div>
          {!b.subscribed && (
            <div className="grid gap-lg sm:grid-cols-2">
              <label className="text-body-small font-semibold text-text">
                CPF ou CNPJ
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  aria-invalid={errors.cpfCnpj ? true : undefined}
                  className={input}
                />
                {errors.cpfCnpj && (
                  <span className="mt-xs block text-caption text-danger">{errors.cpfCnpj}</span>
                )}
              </label>
              <label className="text-body-small font-semibold text-text">
                E-mail para as faturas
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  className={input}
                />
                {errors.email && (
                  <span className="mt-xs block text-caption text-danger">{errors.email}</span>
                )}
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-lg">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Enviando…' : b.subscribed ? 'Trocar plano' : 'Assinar'}
            </button>
            <span className="text-body text-text">
              {money(price)}
              {cycle === 'yearly' ? ' por ano' : ' por mês'}
            </span>
            {b.subscribed && (
              <button
                type="button"
                disabled={busy}
                onClick={cancel}
                className={`${btnOutline} ml-auto`}
              >
                Cancelar assinatura
              </button>
            )}
          </div>
          {!b.subscribed && b.status === 'trial' && (
            <p className="text-caption text-text-muted">
              Você só paga quando o teste terminar. Pix, boleto ou cartão, direto na fatura.
            </p>
          )}
        </form>
      )}
      {msg && (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`mt-md text-body-small ${msg.ok ? 'text-text' : 'text-danger'}`}
        >
          {msg.text}
        </p>
      )}

      {b.payments.length > 0 && (
        <div className="mt-xl overflow-x-auto">
          <h3 className="text-body-small font-semibold text-text-muted">Histórico de cobranças</h3>
          <table className="mt-sm w-full text-left text-body-small">
            <thead className="text-text-muted">
              <tr>
                <th className="py-xs font-semibold">Vencimento</th>
                <th className="py-xs font-semibold">Valor</th>
                <th className="py-xs font-semibold">Situação</th>
                <th className="py-xs" />
              </tr>
            </thead>
            <tbody>
              {b.payments.map((p) => (
                <tr key={p.id} className="border-t border-border text-text">
                  <td className="py-sm">{dateBr(p.dueDate)}</td>
                  <td className="py-sm">{money(p.valueCents)}</td>
                  <td className="py-sm">{PAYMENT_LABELS[p.status] ?? p.status}</td>
                  <td className="py-sm text-right">
                    {p.invoiceUrl && (
                      <a
                        href={p.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary-text underline"
                      >
                        Fatura
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Aguardando pagamento',
  OVERDUE: 'Vencida',
  RECEIVED: 'Paga',
  CONFIRMED: 'Paga',
  RECEIVED_IN_CASH: 'Paga',
  REFUNDED: 'Estornada',
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-heading text-text">{value}</dd>
    </div>
  );
}
