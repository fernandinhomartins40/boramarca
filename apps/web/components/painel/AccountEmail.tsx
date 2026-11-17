'use client';

import { useState, type FormEvent } from 'react';
import { emailState, type Professional } from '@boramarca/shared';
import { input } from '@/components/site/ui';
import { resendEmailConfirmation, saveEmail } from './actions';
import { useSession } from './PanelShell';
import { btnOutline, btnPrimary, card, errorText, Icon } from './ui';

/** "Sua conta": optional e-mail with its confirmation state (confirmado / aguardando / reenviar). */
export function AccountEmail() {
  const { api, me } = useSession();
  const [pro, setPro] = useState<Pick<Professional, 'email' | 'emailVerifiedAt'>>(me.professional);
  const [value, setValue] = useState(me.professional.email ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const state = emailState(pro);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(undefined);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await saveEmail(api, value);
      setPro(r.professional);
      setValue(r.professional.email ?? '');
      return r.professional.email
        ? 'Enviamos um link de confirmação. Confira sua caixa de entrada.'
        : 'E-mail removido.';
    });
  };
  const resend = () =>
    void run(async () => {
      await resendEmailConfirmation(api);
      return 'Link reenviado. Confira sua caixa de entrada.';
    });

  return (
    <section className={`${card} mb-lg p-xl`} aria-labelledby="conta-email">
      <h2 id="conta-email" className="text-body-small font-semibold text-text-muted">
        Sua conta
      </h2>
      <form onSubmit={save} className="mt-lg flex flex-wrap items-end gap-md">
        <label className="min-w-0 flex-1 basis-64 text-body-small font-semibold text-text">
          E-mail (opcional)
          <input
            type="email"
            autoComplete="email"
            maxLength={254}
            className={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="voce@exemplo.com"
          />
        </label>
        <button
          type="submit"
          className={btnPrimary}
          disabled={busy || value.trim().toLowerCase() === (pro.email ?? '')}
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
      {state === 'verified' && (
        <p className="mt-md inline-flex items-center gap-sm rounded-pill bg-success px-md py-xs text-body-small font-semibold text-on-success">
          <Icon name="check" className="size-4" /> Confirmado
        </p>
      )}
      {state === 'pending' && (
        <div className="mt-md flex flex-wrap items-center gap-md">
          <span className="rounded-pill bg-warning px-md py-xs text-body-small font-semibold text-on-warning">
            Aguardando confirmação
          </span>
          <button type="button" className={btnOutline} disabled={busy} onClick={resend}>
            Reenviar link
          </button>
        </div>
      )}
      <p className="mt-md text-body-small text-text-muted">
        Usamos só para avisos da conta e comprovantes, depois que você confirmar.
      </p>
      {msg && (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`mt-sm text-body-small ${msg.ok ? 'text-text' : 'text-danger'}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
