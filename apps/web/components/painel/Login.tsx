'use client';

import { useRef, useState, type FormEvent } from 'react';
import { routes } from '@boramarca/shared';
import { Field, describe } from '@/components/site/Field';
import { Logo } from '@/components/site/Logo';
import { btn, input } from '@/components/site/ui';
import { ApiCallError, toE164 } from '@/lib/api';
import { sendFirebaseCode, type ConfirmCode } from '@/lib/firebase-phone';
import type { PanelClient } from './client';
import { errorText } from './ui';

/**
 * Owner login: phone → 6-digit code (POST /auth/otp/request, /auth/otp/verify). When the API says
 * `provider: "firebase"`, Firebase sends the SMS and the code is checked by POST /auth/firebase.
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
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  /** `email`: the code went to the account's confirmed e-mail (works without SMS). */
  const [via, setVia] = useState<{ email: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const captcha = useRef<HTMLDivElement>(null);
  const confirmCode = useRef<ConfirmCode | null>(null);

  async function requestCode(e: FormEvent, byEmail = false) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!/^\+[1-9]\d{9,14}$/.test(e164)) return setError('Informe o telefone com DDD.');
    setBusy(true);
    setError(undefined);
    setVia(null);
    try {
      if (byEmail) {
        const r = await api.call(routes.signup.emailCodeRequest, { body: { phone: e164 } });
        setVia({ email: r.email });
        confirmCode.current = null;
        return setStep('code');
      }
      const r = await api.call(routes.auth.otpRequest, { body: { phone: e164, purpose: 'login' } });
      confirmCode.current =
        r.provider === 'firebase' ? await sendFirebaseCode(e164, captcha.current!) : null;
      setStep('code');
    } catch (err) {
      setError(errorText(err));
      // 429 = a code was sent a moment ago: let the person type it.
      if (err instanceof ApiCallError && err.status === 429) setStep('code');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('O código tem 6 dígitos.');
    setBusy(true);
    setError(undefined);
    try {
      const t = via
        ? await api.call(routes.signup.emailCodeVerify, { body: { phone: toE164(phone), code } })
        : confirmCode.current
          ? await api.call(routes.auth.firebaseLogin, {
              body: { idToken: await confirmCode.current(code) },
            })
          : await api.call(routes.auth.otpVerify, { body: { phone: toE164(phone), code } });
      api.store.set({
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        accessTokenExpiresAt: t.accessTokenExpiresAt,
        refreshTokenExpiresAt: t.refreshTokenExpiresAt,
      });
      onLoggedIn();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-lg">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-xl md:p-xxl">
        <Logo className="h-8 w-auto" />
        <h1 className="mt-xl text-title text-text">Painel do dono</h1>
        <p className="mt-xs text-body-small text-text-muted">
          Acompanhe a equipe e responda as decisões pelo computador.
        </p>
        {notice && (
          <p
            role="status"
            className="mt-lg rounded-md bg-surface-alt p-lg text-body-small text-text"
          >
            {notice}
          </p>
        )}
        {step === 'phone' ? (
          <form onSubmit={requestCode} className="mt-xl space-y-lg" noValidate>
            <Field
              id="phone"
              label="Seu WhatsApp"
              error={error}
              hint="Com DDD. Enviamos um código."
            >
              <input
                {...describe('phone', error, 'Com DDD. Enviamos um código.')}
                className={input}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="(11) 90000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <button type="submit" disabled={busy} className={`${btn.base} ${btn.primary} w-full`}>
              {busy ? 'Enviando…' : 'Receber código por SMS'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => void requestCode(e, true)}
              className={`${btn.base} ${btn.outline} w-full`}
            >
              Receber o código por e-mail
            </button>
            <p className="text-center text-body-small text-text-muted">
              Ainda não tem conta?{' '}
              <a href="/cadastro" className="font-semibold text-primary-text underline">
                Começar grátis
              </a>
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-xl space-y-lg" noValidate>
            {via && (
              <p className="text-body-small text-text">
                Se este celular tem um e-mail confirmado, enviamos o código para{' '}
                <strong>{via.email}</strong>.
              </p>
            )}
            <Field id="code" label="Código de 6 dígitos" error={error}>
              <input
                {...describe('code', error)}
                className={`${input} tracking-[0.3em]`}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </Field>
            <button type="submit" disabled={busy} className={`${btn.base} ${btn.primary} w-full`}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              className="w-full text-body-small font-semibold text-primary-text hover:underline"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(undefined);
              }}
            >
              Trocar telefone
            </button>
          </form>
        )}
        <div ref={captcha} />
      </div>
    </main>
  );
}
