'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Password,
  PROFESSION_LABELS,
  PROFESSIONS,
  routes,
  SignupRequestBody,
  TRIAL_DAYS,
} from '@boramarca/shared';
import { browserStore } from '@/components/painel/client';
import { ApiCallError, callApi, fieldErrors, toE164 } from '@/lib/api';
import { describe, Field } from './Field';
import { btn, input } from './ui';

/** Validates the sign-up form with the shared schema; returns the body or per-field errors. */
export function parseSignup(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? '');
  // The web always sets a password (login by e-mail + password); the app signs up without one.
  const parsed = SignupRequestBody.extend({ password: Password }).safeParse({
    name: get('name'),
    salonName: get('salonName'),
    profession: get('profession'),
    phone: toE164(get('phone')),
    email: get('email'),
    password: get('password'),
  });
  if (parsed.success) return { ok: true as const, body: parsed.data };
  const errors = fieldErrors(parsed.error);
  if (errors.profession) errors.profession = 'Escolha sua profissão.';
  return { ok: false as const, errors };
}

/** Free sign-up: data → 6-digit code by e-mail → account (trial) → owner panel. */
export function SignupFlow() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [body, setBody] = useState<SignupRequestBody>();
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(b: SignupRequestBody) {
    const r = await callApi(routes.signup.request, { body: b });
    setMasked(r.email);
    setStep('code');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const result = parseSignup(new FormData(e.currentTarget));
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    setBody(result.body);
    setBusy(true);
    try {
      await send(result.body);
    } catch (err) {
      setFormError(err instanceof ApiCallError ? err.message : 'Algo deu errado.');
      // 429: a code went out a moment ago — let the person type it.
      if (err instanceof ApiCallError && err.status === 429) setStep('code');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setFormError('O código tem 6 dígitos.');
    setBusy(true);
    setFormError('');
    try {
      const t = await callApi(routes.signup.verify, { body: { email: body!.email, code } });
      browserStore.set({
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        accessTokenExpiresAt: t.accessTokenExpiresAt,
        refreshTokenExpiresAt: t.refreshTokenExpiresAt,
      });
      router.push('/painel');
    } catch (err) {
      setFormError(err instanceof ApiCallError ? err.message : 'Algo deu errado.');
      setBusy(false);
    }
  }

  if (step === 'code')
    return (
      <form onSubmit={verify} className="space-y-lg" noValidate>
        <p className="text-body text-text">
          Enviamos um código de 6 dígitos para <strong>{masked || body?.email}</strong>. Confira
          também a caixa de spam.
        </p>
        <Field id="code" label="Código" error={formError}>
          <input
            {...describe('code', formError)}
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
          {busy ? 'Criando sua conta…' : 'Criar minha conta'}
        </button>
        <button
          type="button"
          className="w-full text-body-small font-semibold text-primary-text hover:underline"
          onClick={() => {
            setStep('form');
            setCode('');
            setFormError('');
          }}
        >
          Corrigir meus dados
        </button>
      </form>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-lg" noValidate>
      <Field id="name" label="Seu nome" error={errors.name}>
        <input
          {...describe('name', errors.name)}
          name="name"
          autoComplete="name"
          className={input}
          defaultValue={body?.name}
        />
      </Field>
      <Field id="salonName" label="Nome do seu negócio" error={errors.salonName}>
        <input
          {...describe('salonName', errors.salonName)}
          name="salonName"
          autoComplete="organization"
          className={input}
          defaultValue={body?.salonName}
        />
      </Field>
      <Field id="profession" label="Profissão" error={errors.profession}>
        <select
          {...describe('profession', errors.profession)}
          name="profession"
          className={input}
          defaultValue={body?.profession ?? ''}
        >
          <option value="" disabled>
            Escolha
          </option>
          {PROFESSIONS.map((p) => (
            <option key={p} value={p}>
              {PROFESSION_LABELS[p]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="phone" label="Celular (WhatsApp)" error={errors.phone} hint="Com DDD.">
        <input
          {...describe('phone', errors.phone, 'Com DDD.')}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          className={input}
          defaultValue={body?.phone}
        />
      </Field>
      <Field id="email" label="E-mail" error={errors.email} hint="Enviamos o código para ele.">
        <input
          {...describe('email', errors.email, 'Enviamos o código para ele.')}
          name="email"
          type="email"
          autoComplete="email"
          className={input}
          defaultValue={body?.email}
        />
      </Field>
      <Field
        id="password"
        label="Crie uma senha"
        error={errors.password}
        hint="Pelo menos 8 caracteres. Você entra no painel com o e-mail e esta senha."
      >
        <input
          {...describe(
            'password',
            errors.password,
            'Pelo menos 8 caracteres. Você entra no painel com o e-mail e esta senha.',
          )}
          name="password"
          type="password"
          autoComplete="new-password"
          className={input}
          defaultValue={body?.password}
        />
      </Field>
      {formError && (
        <p role="alert" className="text-body-small text-danger">
          {formError}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${btn.base} ${btn.accent} w-full`}>
        {busy ? 'Enviando…' : 'Receber código por e-mail'}
      </button>
      <p className="text-caption text-text-muted">
        {TRIAL_DAYS} dias grátis, sem cartão. Ao criar a conta você aceita os{' '}
        <a href="/termos" className="underline">
          Termos
        </a>{' '}
        e a{' '}
        <a href="/privacidade" className="underline">
          Política de privacidade
        </a>
        .
      </p>
    </form>
  );
}
