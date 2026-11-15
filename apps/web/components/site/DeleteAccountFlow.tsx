'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  OtpCodeValue,
  OWNER_HAS_TEAM_ERROR,
  PhoneE164,
  routes,
  type DeleteMeBody,
  type TeamMember,
} from '@boramarca/shared';
import { ApiCallError, callApi, toE164 } from '@/lib/api';
import { describe, Field } from './Field';
import { btn, input } from './ui';

type Step = 'phone' | 'loginCode' | 'confirm' | 'deleteCode' | 'team' | 'done';

const msg = (err: unknown) =>
  err instanceof Error ? err.message : 'Algo deu errado. Tente de novo em instantes.';

/**
 * /excluir-conta, without the app: `DELETE /me` needs a session, so the person first proves the
 * number is theirs with a login code, then confirms with a fresh `delete_account` code.
 */
export function DeleteAccountFlow() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [deleteCode, setDeleteCode] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  /** Runs one step; API errors become a message next to the form. */
  const run = (fn: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  const requestCode = (purpose: 'login' | 'delete_account') =>
    callApi(routes.auth.otpRequest, { body: { phone, purpose } });

  const onPhone = run(async () => {
    if (!PhoneE164.safeParse(phone).success)
      throw new Error('Informe o celular com DDD, por exemplo (11) 98765-4321.');
    await requestCode('login');
    setStep('loginCode');
  });

  const onLoginCode = (code: string) =>
    run(async () => {
      const res = await callApi(routes.auth.otpVerify, { body: { phone, code } });
      setToken(res.accessToken);
      setIsNewUser(res.isNewUser);
      setStep('confirm');
    });

  const onConfirm = run(async () => {
    await requestCode('delete_account');
    setStep('deleteCode');
  });

  const sendDelete = async (code: string, extra: Partial<DeleteMeBody> = {}) => {
    try {
      await callApi(routes.auth.deleteMe, { body: { code, origin: 'web', ...extra }, token });
      setToken('');
      setStep('done');
    } catch (err) {
      if (err instanceof ApiCallError && err.code === OWNER_HAS_TEAM_ERROR) {
        const res = await callApi(routes.salon.team.list, { token });
        setTeam(res.items.filter((m) => m.role !== 'owner'));
        setStep('team');
        return;
      }
      if (err instanceof ApiCallError && err.code.startsWith('OTP_')) setStep('deleteCode');
      throw err;
    }
  };

  const onDeleteCode = (code: string) =>
    run(async () => {
      setDeleteCode(code);
      await sendDelete(code);
    });

  const onTeamChoice = (choice: string) =>
    run(() =>
      sendDelete(
        deleteCode,
        choice === 'all' ? { deleteWholeSalon: true } : { transferOwnershipTo: choice },
      ),
    );

  const resend = (purpose: 'login' | 'delete_account') =>
    run(async () => {
      await requestCode(purpose);
      setInfo('Enviamos um novo código.');
    });

  const feedback = (
    <>
      {error && (
        <p role="alert" className="rounded-md bg-surface-alt p-md text-body-small text-danger">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="text-body-small text-text-muted">
          {info}
        </p>
      )}
    </>
  );

  return (
    <div className="rounded-lg bg-surface p-xl shadow-sm">
      <p className="text-caption text-text-muted" aria-live="polite">
        {STEP_LABEL[step]}
      </p>

      {step === 'phone' && (
        <Form onSubmit={onPhone} busy={busy} submit="Enviar código" feedback={feedback}>
          <Field
            id="del-phone"
            label="Celular da conta"
            hint="O mesmo número que você usa para entrar no app."
          >
            <input
              {...describe(
                'del-phone',
                undefined,
                'O mesmo número que você usa para entrar no app.',
              )}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="(11) 98765-4321"
              className={input}
              onChange={(e) => setPhone(toE164(e.target.value))}
            />
          </Field>
        </Form>
      )}

      {step === 'loginCode' && (
        <CodeForm
          key="login"
          label="Código que enviamos para o seu celular"
          hint="Confirma que o número é seu."
          busy={busy}
          submit="Continuar"
          onSubmit={onLoginCode}
          onResend={resend('login')}
          feedback={feedback}
        />
      )}

      {step === 'confirm' && (
        <ConfirmForm onSubmit={onConfirm} busy={busy} isNewUser={isNewUser} feedback={feedback} />
      )}

      {step === 'deleteCode' && (
        <CodeForm
          key="delete"
          label="Código de exclusão"
          hint="Enviamos um novo código só para confirmar a exclusão."
          busy={busy}
          submit="Excluir minha conta"
          danger
          onSubmit={onDeleteCode}
          onResend={resend('delete_account')}
          feedback={feedback}
        />
      )}

      {step === 'team' && (
        <TeamForm team={team} busy={busy} onSubmit={onTeamChoice} feedback={feedback} />
      )}

      {step === 'done' && (
        <div role="status" className="mt-md">
          <p className="text-heading text-text">Conta excluída.</p>
          <p className="mt-sm text-body text-text">
            Apagamos seus dados e os dos seus clientes e desconectamos o WhatsApp. Se quiser voltar,
            é só criar uma conta nova no app.
          </p>
        </div>
      )}
    </div>
  );
}

const STEP_LABEL: Record<Step, string> = {
  phone: 'Passo 1 de 4: seu número',
  loginCode: 'Passo 2 de 4: confirme que o número é seu',
  confirm: 'Passo 3 de 4: confirme a exclusão',
  deleteCode: 'Passo 4 de 4: código de exclusão',
  team: 'Passo 4 de 4: seu espaço tem outros profissionais',
  done: 'Pronto',
};

function Form({
  onSubmit,
  busy,
  submit,
  danger,
  feedback,
  extra,
  children,
}: {
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  submit: string;
  danger?: boolean;
  feedback: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form noValidate onSubmit={onSubmit} className="mt-md flex flex-col gap-lg">
      {children}
      {feedback}
      <div className="flex flex-wrap items-center gap-md">
        <button
          type="submit"
          disabled={busy}
          className={`${btn.base} ${danger ? btn.danger : btn.primary}`}
        >
          {busy ? 'Aguarde…' : submit}
        </button>
        {extra}
      </div>
    </form>
  );
}

function CodeForm({
  label,
  hint,
  busy,
  submit,
  danger,
  onSubmit,
  onResend,
  feedback,
}: {
  label: string;
  hint: string;
  busy: boolean;
  submit: string;
  danger?: boolean;
  onSubmit: (code: string) => (e?: FormEvent) => void;
  onResend: () => void;
  feedback: ReactNode;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  return (
    <Form
      busy={busy}
      submit={submit}
      danger={danger}
      feedback={feedback}
      onSubmit={(e) => {
        e.preventDefault();
        const ok = OtpCodeValue.safeParse(code).success;
        setError(ok ? '' : 'O código tem 6 dígitos.');
        if (ok) onSubmit(code)();
      }}
      extra={
        <button
          type="button"
          onClick={onResend}
          disabled={busy}
          className="text-body-small text-primary-text underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Reenviar código
        </button>
      }
    >
      <Field id="del-code" label={label} hint={hint} error={error}>
        <input
          {...describe('del-code', error, hint)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className={`${input} tracking-[0.5em]`}
        />
      </Field>
    </Form>
  );
}

function ConfirmForm({
  onSubmit,
  busy,
  isNewUser,
  feedback,
}: {
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  isNewUser: boolean;
  feedback: ReactNode;
}) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  return (
    <Form
      busy={busy}
      submit="Enviar código de exclusão"
      danger
      feedback={feedback}
      onSubmit={(e) => {
        e.preventDefault();
        setError(checked ? '' : 'Marque a confirmação para continuar.');
        if (checked) onSubmit(e);
      }}
    >
      {isNewUser && (
        <p className="text-body-small text-text">
          Não encontramos atendimentos neste número. Se continuar, apagamos o cadastro dele.
        </p>
      )}
      <p className="text-body text-text">
        A exclusão é definitiva: a agenda, os clientes, as conversas e a conexão com o WhatsApp
        deixam de existir e não dá para recuperar.
      </p>
      <div>
        <label className="flex items-start gap-md text-body-small text-text">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'del-confirm-error' : undefined}
            className="mt-xs size-5 accent-[var(--color-danger)]"
          />
          Entendo que a exclusão é definitiva e quero apagar minha conta.
        </label>
        {error && (
          <p id="del-confirm-error" className="mt-xs text-caption text-danger">
            {error}
          </p>
        )}
      </div>
    </Form>
  );
}

function TeamForm({
  team,
  busy,
  onSubmit,
  feedback,
}: {
  team: TeamMember[];
  busy: boolean;
  onSubmit: (choice: string) => (e?: FormEvent) => void;
  feedback: ReactNode;
}) {
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  return (
    <Form
      busy={busy}
      submit="Confirmar e excluir"
      danger
      feedback={feedback}
      onSubmit={(e) => {
        e.preventDefault();
        setError(choice ? '' : 'Escolha uma opção.');
        if (choice) onSubmit(choice)();
      }}
    >
      <fieldset aria-describedby={error ? 'del-team-error' : undefined}>
        <legend className="text-body text-text">
          Você é dono de um espaço com outros profissionais. Antes de sair, escolha o que acontece
          com ele:
        </legend>
        <div className="mt-md flex flex-col gap-sm">
          {team.map((m) => (
            <label key={m.id} className="flex items-center gap-md text-body-small text-text">
              <input
                type="radio"
                name="team-choice"
                value={m.id}
                checked={choice === m.id}
                onChange={() => setChoice(m.id)}
                className="size-5 accent-[var(--color-primary)]"
              />
              Passar o espaço para {m.name} e apagar só a minha conta
            </label>
          ))}
          <label className="flex items-center gap-md text-body-small text-text">
            <input
              type="radio"
              name="team-choice"
              value="all"
              checked={choice === 'all'}
              onChange={() => setChoice('all')}
              className="size-5 accent-[var(--color-danger)]"
            />
            Apagar o espaço inteiro, com as contas e os dados de todos os profissionais
          </label>
        </div>
        {error && (
          <p id="del-team-error" className="mt-xs text-caption text-danger">
            {error}
          </p>
        )}
      </fieldset>
    </Form>
  );
}
