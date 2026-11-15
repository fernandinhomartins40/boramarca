'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  PROFESSION_LABELS,
  PROFESSIONS,
  routes,
  TeamMemberCreate,
  type Profession,
  type TeamMember,
  type WhatsAppStatus,
} from '@boramarca/shared';
import { Field, describe } from '@/components/site/Field';
import { input } from '@/components/site/ui';
import { toE164 } from '@/lib/api';
import { formatPhone, WEEK_ORDER, WEEKDAY_LONG, weekSummary } from './format';
import { useSession } from './PanelShell';
import {
  Async,
  Avatar,
  btnOutline,
  btnPrimary,
  card,
  Empty,
  errorText,
  Icon,
  PageHeader,
  useLoad,
} from './ui';

const WHATSAPP: Record<WhatsAppStatus, { label: string; ok: boolean }> = {
  connected: { label: 'WhatsApp conectado', ok: true },
  connecting: { label: 'WhatsApp conectando', ok: false },
  waiting_qr: { label: 'WhatsApp aguardando pareamento', ok: false },
  disconnected: { label: 'WhatsApp desconectado', ok: false },
  error: { label: 'WhatsApp com erro', ok: false },
};

const professionsLabel = (p: Profession[]) => p.map((x) => PROFESSION_LABELS[x]).join(', ');

export function TeamPage() {
  const { api } = useSession();
  const team = useLoad(() => api.call(routes.salon.team.list), []);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [editing, setEditing] = useState(false);
  const member = team.data?.items.find((m) => m.id === selected);

  return (
    <div className="grid gap-xl xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <PageHeader
          title="Sua equipe"
          subtitle={
            team.data &&
            `${team.data.items.length} ${team.data.items.length === 1 ? 'profissional ativo' : 'profissionais ativos'}`
          }
          actions={
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setSelected('new');
                setEditing(true);
              }}
            >
              <Icon name="plus" /> Adicionar profissional
            </button>
          }
        />
        <Async state={team}>
          {(data) =>
            !data.items.length ? (
              <Empty title="Ninguém na equipe ainda">Adicione o primeiro profissional.</Empty>
            ) : (
              <ul className="space-y-md">
                {data.items.map((m) => {
                  const wa = WHATSAPP[m.whatsappStatus];
                  const active = m.id === selected;
                  return (
                    <li
                      key={m.id}
                      className={`${card} flex flex-wrap items-center gap-lg p-lg ${active ? 'border-primary ring-1 ring-primary' : ''}`}
                    >
                      <Avatar name={m.name} />
                      <div className="min-w-40 flex-1">
                        <p className="font-bold text-text">{m.name}</p>
                        <p className="text-body-small text-text-muted">
                          {professionsLabel(m.professions)}
                          {m.role === 'owner' && ' · Dono(a)'}
                        </p>
                      </div>
                      <p className="flex items-center gap-sm text-caption text-text">
                        <Icon name="calendar" className="size-4" />
                        {weekSummary(m.workingHours)}
                      </p>
                      <span
                        className={`rounded-md px-md py-xs text-caption font-semibold ${
                          wa.ok ? 'bg-success text-on-success' : 'bg-surface-alt text-text-muted'
                        }`}
                      >
                        {wa.label}
                      </span>
                      <span className="text-caption text-text-muted">
                        {m.servicesCount} {m.servicesCount === 1 ? 'serviço' : 'serviços'}
                      </span>
                      <div className="flex gap-sm">
                        <Link href="/painel" className={btnOutline}>
                          <Icon name="calendar" className="size-4" /> Ver agenda
                        </Link>
                        <button
                          type="button"
                          className={btnPrimary}
                          aria-pressed={active}
                          onClick={() => {
                            setSelected(m.id);
                            setEditing(false);
                          }}
                        >
                          Detalhes
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </Async>
      </div>
      {(selected === 'new' || member) && (
        <aside
          aria-label={member ? `Detalhes de ${member.name}` : 'Novo profissional'}
          className={`${card} relative self-start p-xl xl:sticky xl:top-xl`}
        >
          <button
            type="button"
            className="absolute top-md right-md rounded-md p-sm text-text-muted hover:text-text"
            aria-label="Fechar"
            onClick={() => setSelected(null)}
          >
            <Icon name="close" />
          </button>
          {editing || !member ? (
            <MemberForm
              key={member?.id ?? 'new'}
              member={member}
              onCancel={() => (member ? setEditing(false) : setSelected(null))}
              onSaved={(id) => {
                setSelected(id);
                setEditing(false);
                void team.reload();
              }}
            />
          ) : (
            <MemberDetail member={member} onEdit={() => setEditing(true)} />
          )}
        </aside>
      )}
    </div>
  );
}

function MemberDetail({ member: m, onEdit }: { member: TeamMember; onEdit: () => void }) {
  const wa = WHATSAPP[m.whatsappStatus];
  return (
    <>
      <div className="flex items-center gap-lg pr-xl">
        <Avatar name={m.name} size="lg" />
        <div>
          <h2 className="text-title text-text">{m.name}</h2>
          <p className="text-body text-text-muted">{professionsLabel(m.professions)}</p>
        </div>
      </div>
      <p className="mt-md text-body-small text-text">{formatPhone(m.phone)}</p>
      <p
        className={`mt-md flex items-center gap-sm rounded-md p-md text-body-small font-semibold ${
          wa.ok ? 'bg-success text-on-success' : 'bg-surface-alt text-text'
        }`}
      >
        {wa.label} {wa.ok && <Icon name="check" className="size-4" />}
      </p>
      <h3 className="mt-xl text-heading text-text">Serviços</h3>
      <p className="mt-xs text-body-small text-text-muted">
        {m.servicesCount} {m.servicesCount === 1 ? 'serviço ativo' : 'serviços ativos'}. Cada
        profissional cuida dos seus serviços pelo app.
      </p>
      <h3 className="mt-xl text-heading text-text">Horário semanal</h3>
      <table className="mt-md w-full overflow-hidden rounded-md border border-border text-body-small">
        <tbody>
          {WEEK_ORDER.map((d) => {
            const h = m.workingHours.find((w) => w.weekday === d);
            return (
              <tr key={d} className="border-b border-border last:border-0">
                <th scope="row" className="p-sm text-left font-normal text-text">
                  {WEEKDAY_LONG[d]}
                </th>
                <td className={`p-sm text-right ${h ? 'text-text' : 'text-text-muted'}`}>
                  {h ? `${h.start} – ${h.end}` : 'Não atende'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className={`${btnOutline} mt-xl w-full`} onClick={onEdit}>
        <Icon name="edit" /> Editar profissional
      </button>
    </>
  );
}

function MemberForm({
  member,
  onCancel,
  onSaved,
}: {
  member?: TeamMember;
  onCancel: () => void;
  onSaved: (id: string | null) => void;
}) {
  const { api, me } = useSession();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canRemove = member && member.id !== me.professional.id;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = TeamMemberCreate.safeParse({
      name: String(f.get('name') ?? ''),
      phone: toE164(String(f.get('phone') ?? '')),
      professions: f.getAll('professions').map(String),
    });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        out[k] ??=
          k === 'name'
            ? 'Informe o nome.'
            : k === 'phone'
              ? 'Informe o WhatsApp com DDD.'
              : 'Escolha ao menos uma profissão.';
      }
      return setErrors(out);
    }
    setBusy(true);
    setErrors({});
    try {
      const saved = member
        ? await api.call(routes.salon.team.update, { params: { id: member.id }, body: parsed.data })
        : await api.call(routes.salon.team.create, { body: parsed.data });
      onSaved(saved.id);
    } catch (err) {
      setErrors({ form: errorText(err) });
      setBusy(false);
    }
  }

  async function remove() {
    if (!member) return;
    setBusy(true);
    try {
      await api.call(routes.salon.team.remove, { params: { id: member.id } });
      onSaved(null);
    } catch (err) {
      setErrors({ form: errorText(err) });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-lg">
      <h2 className="pr-xl text-title text-text">
        {member ? `Editar ${member.name}` : 'Adicionar profissional'}
      </h2>
      <Field id="name" label="Nome" error={errors.name}>
        <input
          {...describe('name', errors.name)}
          name="name"
          defaultValue={member?.name}
          className={input}
          autoComplete="off"
        />
      </Field>
      <Field id="phone" label="WhatsApp" error={errors.phone} hint="Com DDD. É o login no app.">
        <input
          {...describe('phone', errors.phone, 'Com DDD. É o login no app.')}
          name="phone"
          type="tel"
          defaultValue={member ? formatPhone(member.phone) : ''}
          className={input}
        />
      </Field>
      <fieldset>
        <legend className="text-body-small font-semibold text-text">Profissão</legend>
        <div className="mt-sm grid grid-cols-2 gap-sm">
          {PROFESSIONS.map((p) => (
            <label key={p} className="flex items-center gap-sm text-body-small text-text">
              <input
                type="checkbox"
                name="professions"
                value={p}
                defaultChecked={member?.professions.includes(p)}
                className="size-4 accent-primary"
              />
              {PROFESSION_LABELS[p]}
            </label>
          ))}
        </div>
        {errors.professions && (
          <p className="mt-xs text-caption text-danger">{errors.professions}</p>
        )}
      </fieldset>
      {errors.form && (
        <p role="alert" className="text-body-small text-danger">
          {errors.form}
        </p>
      )}
      <div className="flex gap-sm">
        <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className={btnOutline} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {canRemove && (
        <div className="border-t border-border pt-lg">
          {!confirmRemove ? (
            <button
              type="button"
              className="text-body-small font-semibold text-danger hover:underline"
              onClick={() => setConfirmRemove(true)}
            >
              Remover da equipe
            </button>
          ) : (
            <div className="space-y-sm rounded-md bg-surface-alt p-md">
              <p className="text-body-small text-text">
                Remover {member.name} apaga a agenda, os clientes e as conversas dessa pessoa e
                desconecta o WhatsApp dela. Não dá para desfazer.
              </p>
              <div className="flex gap-sm">
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex min-h-10 items-center rounded-md bg-danger px-lg text-body-small font-semibold text-on-danger"
                  onClick={() => void remove()}
                >
                  Remover e apagar dados
                </button>
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => setConfirmRemove(false)}
                >
                  Manter
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
