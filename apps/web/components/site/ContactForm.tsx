'use client';

import { useRef, useState, type FormEvent } from 'react';
import { LeadCreate, PROFESSION_LABELS, PROFESSIONS, routes } from '@boramarca/shared';
import { ApiCallError, callApi, fieldErrors, toE164 } from '@/lib/api';
import { describe, Field } from './Field';
import { btn, input } from './ui';

const PHONE_ERROR = 'Informe o WhatsApp com DDD, por exemplo (11) 98765-4321.';
const NAME_ERROR = 'Informe seu nome.';

/** Validates the form with the shared schema; returns the body or per-field errors. */
export function parseLead(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? '');
  const parsed = LeadCreate.safeParse({
    name: get('name'),
    phone: toE164(get('phone')),
    profession: get('profession') || null,
    message: get('message').trim() || null,
    source: 'site_contato',
    website: get('website'),
  });
  if (parsed.success) return { ok: true as const, body: parsed.data };
  const errors = fieldErrors(parsed.error);
  if (errors.phone) errors.phone = PHONE_ERROR;
  if (errors.name) errors.name = NAME_ERROR;
  return { ok: false as const, errors };
}

export function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [formError, setFormError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const result = parseLead(new FormData(e.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      // Move focus to the first invalid field so keyboard and screen reader users land on it.
      const first = ['name', 'phone', 'profession', 'message'].find((k) => result.errors[k]);
      if (first) formRef.current?.querySelector<HTMLElement>(`#lead-${first}`)?.focus();
      return;
    }
    setErrors({});
    setStatus('sending');
    try {
      await callApi(routes.site.createLead, { body: result.body });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setFormError(
        err instanceof ApiCallError ? err.message : 'Não deu para enviar agora. Tente de novo.',
      );
    }
  }

  if (status === 'sent')
    return (
      <div role="status" className="rounded-lg bg-accent-soft p-xl text-body text-text">
        <p className="font-semibold">Recebemos sua mensagem.</p>
        <p className="mt-sm">A gente fala com você pelo WhatsApp em breve.</p>
      </div>
    );

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} className="flex flex-col gap-lg">
      <Field id="lead-name" label="Nome" error={errors.name}>
        <input
          {...describe('lead-name', errors.name)}
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          className={input}
        />
      </Field>
      <Field id="lead-phone" label="WhatsApp" error={errors.phone} hint="Com DDD.">
        <input
          {...describe('lead-phone', errors.phone, 'Com DDD.')}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="(11) 98765-4321"
          className={input}
        />
      </Field>
      <Field id="lead-profession" label="Profissão (opcional)" error={errors.profession}>
        <select
          {...describe('lead-profession', errors.profession)}
          name="profession"
          defaultValue=""
          className={input}
        >
          <option value="">Escolha</option>
          {PROFESSIONS.map((p) => (
            <option key={p} value={p}>
              {PROFESSION_LABELS[p]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="lead-message" label="Mensagem (opcional)" error={errors.message}>
        <textarea
          {...describe('lead-message', errors.message)}
          name="message"
          rows={4}
          maxLength={2000}
          className={input}
        />
      </Field>
      {/* Honeypot: hidden from people and assistive tech; robots fill it and get rejected. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="lead-website">Não preencha</label>
        <input id="lead-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {formError && (
        <p role="alert" className="rounded-md bg-surface-alt p-md text-body-small text-danger">
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className={`${btn.base} ${btn.primary} self-start`}
      >
        {status === 'sending' ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  );
}
