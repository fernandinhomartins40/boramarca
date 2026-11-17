'use client';

import { useState, type FormEvent } from 'react';
import { routes, type AuthTokens } from '@boramarca/shared';
import { Field, describe } from '@/components/site/Field';
import { Logo } from '@/components/site/Logo';
import { btn, input } from '@/components/site/ui';
import { ApiCallError } from '@/lib/api';
import type { PanelClient } from './client';
import { errorText } from './ui';

/**
 * Owner login on the web: e-mail + password (POST /auth/password/login), no SMS cost.
 * "Esqueci minha senha" is also how an account creates its first one: 6-digit code by e-mail,
 * then the new password. The app keeps the SMS login.
 */
export function Login({
  api,
  notice,
  onLoggedIn,
}: {
  api: PanelClient;
  notice?: string;
  onLoggedIn: () => void;
}) {
  const [step, setStep] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const go = (s: typeof step) => {
    setStep(s);
    setError(undefined);
    setPassword('');
    setCode('');
  };

  /** Runs one form: `check` returns a pt-BR message when the input is not ready to send. */
  async function run(e: FormEvent, check: string | undefined, send: () => Promise<void>) {
    e.preventDefault();
    if (check) return setError(check);
    setBusy(true);
    setError(undefined);
    try {
      await send();
    } catch (err) {
      setError(errorText(err));
      // 429 on the code request = one went out a moment ago: let the person type it.
      if (step === 'forgot' && err instanceof ApiCallError && err.status === 429) {
        setStep('reset');
        setError(undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  const enter = (t: AuthTokens) => {
    api.store.set({
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      accessTokenExpiresAt: t.accessTokenExpiresAt,
      refreshTokenExpiresAt: t.refreshTokenExpiresAt,
    });
    onLoggedIn();
  };

  const login = (e: FormEvent) =>
    run(e, !email.trim() || !password ? 'Informe e-mail e senha.' : undefined, async () =>
      enter(await api.call(routes.signup.passwordLogin, { body: { email, password } })),
    );

  const requestCode = (e: FormEvent) =>
    run(e, !email.trim() ? 'Informe seu e-mail.' : undefined, async () => {
      const r = await api.call(routes.signup.passwordResetRequest, { body: { email } });
      setMasked(r.email);
      go('reset');
    });

  const reset = (e: FormEvent) =>
    run(
      e,
      !/^\d{6}$/.test(code)
        ? 'O código tem 6 dígitos.'
        : password.length < 8
          ? 'A senha precisa de pelo menos 8 caracteres.'
          : undefined,
      async () =>
        enter(await api.call(routes.signup.passwordReset, { body: { email, code, password } })),
    );

  const link = 'w-full text-body-small font-semibold text-primary-text hover:underline';
  const submit = `${btn.base} ${btn.primary} w-full`;
  const emailInput = (err?: string) => (
    <Field id="email" label="E-mail" error={err}>
      <input
        {...describe('email', err)}
        className={input}
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="voce@exemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
    </Field>
  );

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-lg">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-xl md:p-xxl">
        <Logo className="h-8 w-auto" />
        <h1 className="mt-xl text-title text-text">
          {step === 'login' ? 'Painel do dono' : 'Criar nova senha'}
        </h1>
        <p className="mt-xs text-body-small text-text-muted">
          {step === 'login'
            ? 'Acompanhe a equipe e responda as decisões pelo computador.'
            : 'Serve também para criar a sua primeira senha de acesso pela web.'}
        </p>
        {notice && (
          <p
            role="status"
            className="mt-lg rounded-md bg-surface-alt p-lg text-body-small text-text"
          >
            {notice}
          </p>
        )}

        {step === 'login' && (
          <form onSubmit={login} className="mt-xl space-y-lg" noValidate>
            {emailInput()}
            <Field id="password" label="Senha" error={error}>
              <input
                {...describe('password', error)}
                className={input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button type="submit" disabled={busy} className={submit}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className={link} onClick={() => go('forgot')}>
              Esqueci minha senha / criar senha
            </button>
            <p className="text-center text-body-small text-text-muted">
              Ainda não tem conta?{' '}
              <a href="/cadastro" className="font-semibold text-primary-text underline">
                Começar grátis
              </a>
            </p>
          </form>
        )}

        {step === 'forgot' && (
          <form onSubmit={requestCode} className="mt-xl space-y-lg" noValidate>
            {emailInput(error)}
            <button type="submit" disabled={busy} className={submit}>
              {busy ? 'Enviando…' : 'Receber código por e-mail'}
            </button>
            <button type="button" className={link} onClick={() => go('login')}>
              Voltar para o login
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={reset} className="mt-xl space-y-lg" noValidate>
            <p className="text-body-small text-text">
              Se existe uma conta com este e-mail, enviamos um código para{' '}
              <strong>{masked || email}</strong>. Confira também a caixa de spam.
            </p>
            <Field id="code" label="Código de 6 dígitos">
              <input
                id="code"
                className={`${input} tracking-[0.3em]`}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </Field>
            <Field
              id="new-password"
              label="Nova senha"
              error={error}
              hint="Pelo menos 8 caracteres."
            >
              <input
                {...describe('new-password', error, 'Pelo menos 8 caracteres.')}
                className={input}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button type="submit" disabled={busy} className={submit}>
              {busy ? 'Salvando…' : 'Salvar senha e entrar'}
            </button>
            <button type="button" className={link} onClick={() => go('forgot')}>
              Trocar e-mail ou pedir outro código
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
