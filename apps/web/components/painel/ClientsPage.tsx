'use client';

import { useEffect, useState } from 'react';
import { routes, type SalonClient } from '@boramarca/shared';
import { input } from '@/components/site/ui';
import { formatPhone, longDate, todayIn } from './format';
import { useSession } from './PanelShell';
import {
  Async,
  Avatar,
  btnOutline,
  card,
  chip,
  Empty,
  errorText,
  Icon,
  PageHeader,
  useLoad,
} from './ui';

type Filter = 'all' | 'inactive' | 'waitlist';
const PAGE = 100;
const MAX = 500; // API limit per request; the CSV always has everyone.

export function ClientsPage() {
  const { api, me } = useSession();
  const tz = me.salon.timezone;
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pro, setPro] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<string>();
  const [exporting, setExporting] = useState<string>();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(typed.trim());
      setLimit(PAGE);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);

  const query = {
    search: search || undefined,
    inactiveDays: filter === 'inactive' ? 30 : undefined,
    onWaitlist: filter === 'waitlist' ? ('true' as const) : undefined,
    professionalId: pro || undefined,
  };
  const team = useLoad(() => api.call(routes.salon.team.list), []);
  const list = useLoad(
    () => api.call(routes.salon.clients, { query: { ...query, limit } }),
    [search, filter, pro, limit],
  );

  async function exportCsv() {
    setExporting('Gerando arquivo…');
    try {
      const res = await api.raw(routes.salon.clients, { query: { ...query, format: 'csv' } });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `clientes-${todayIn(tz)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExporting(undefined);
    } catch (e) {
      setExporting(errorText(e));
    }
  }

  const pick = (f: Filter) => {
    setFilter(f);
    setLimit(PAGE);
  };

  return (
    <div className="grid gap-xl xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <PageHeader
          title="Clientes"
          subtitle="Conheça quem volta e quem precisa de um lembrete"
          actions={
            <button type="button" className={btnOutline} onClick={() => void exportCsv()}>
              <Icon name="download" /> Exportar CSV
            </button>
          }
        />
        {exporting && (
          <p role="status" className="mb-lg text-body-small text-text-muted">
            {exporting}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-md">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Buscar por nome ou telefone</span>
            <Icon
              name="search"
              className="absolute top-1/2 left-md size-5 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className={`${input} mt-0 pl-xxl`}
            />
          </label>
          {(
            [
              ['all', 'Todos'],
              ['inactive', 'Sem atendimento há 30 dias'],
              ['waitlist', 'Lista de espera'],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={chip}
              onClick={() => pick(f)}
            >
              {label}
            </button>
          ))}
          <label>
            <span className="sr-only">Profissional</span>
            <select
              value={pro}
              onChange={(e) => {
                setPro(e.target.value);
                setLimit(PAGE);
              }}
              className="min-h-10 rounded-pill border border-border bg-surface px-lg text-body-small text-text"
            >
              <option value="">Todos os profissionais</option>
              {team.data?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-lg">
          <Async state={list}>
            {(data) => {
              const waiting = data.items.filter((c) => c.onWaitlist);
              const rows = data.items;
              return (
                <>
                  {waiting.length > 0 && filter !== 'waitlist' && (
                    <button
                      type="button"
                      onClick={() => pick('waitlist')}
                      className="mb-lg flex w-full items-center gap-md rounded-lg bg-surface-alt p-lg text-left text-heading text-primary-text"
                    >
                      <Icon name="team" />
                      <span className="flex-1">
                        {waiting.length}{' '}
                        {waiting.length === 1 ? 'pessoa aguardando' : 'pessoas aguardando'} uma vaga
                      </span>
                      <Icon name="right" />
                    </button>
                  )}
                  {!rows.length ? (
                    <Empty title="Nenhum cliente encontrado">
                      {search || filter !== 'all' || pro
                        ? 'Tente outra busca ou outro filtro.'
                        : 'Os clientes aparecem aqui quando a equipe começar a atender.'}
                    </Empty>
                  ) : (
                    <ClientTable rows={rows} tz={tz} selected={selected} onSelect={setSelected} />
                  )}
                  <div className="mt-lg flex flex-wrap items-center justify-between gap-md text-body-small text-text-muted">
                    <span>
                      {rows.length} {rows.length === 1 ? 'cliente' : 'clientes'}
                      {data.nextCursor ? ' (há mais)' : ''}
                    </span>
                    {data.nextCursor &&
                      (limit < MAX ? (
                        <button
                          type="button"
                          className={btnOutline}
                          disabled={list.loading}
                          onClick={() => setLimit(Math.min(limit + PAGE, MAX))}
                        >
                          {list.loading ? 'Carregando…' : 'Carregar mais'}
                        </button>
                      ) : (
                        <span>Para ver todos, use Exportar CSV ou refine a busca.</span>
                      ))}
                  </div>
                </>
              );
            }}
          </Async>
        </div>
      </div>
      <ClientDetail
        client={list.data?.items.find((c) => c.id === selected)}
        tz={tz}
        onClose={() => setSelected(undefined)}
      />
    </div>
  );
}

function ClientTable({
  rows,
  tz,
  selected,
  onSelect,
}: {
  rows: SalonClient[];
  tz: string;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[44rem] text-left text-body-small">
        <thead className="text-text-muted">
          <tr>
            {[
              'Cliente',
              'Último atendimento',
              'Profissional',
              'Visitas',
              'Faltas',
              'Lista de espera',
            ].map((h) => (
              <th key={h} scope="col" className="p-md font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.id}
              className={`border-t border-border ${c.id === selected ? 'bg-accent-soft' : 'hover:bg-surface-alt/50'}`}
            >
              <th scope="row" className="p-md font-normal">
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-pressed={c.id === selected}
                  className="flex items-center gap-md text-left"
                >
                  <Avatar name={c.name} size="sm" />
                  <span>
                    <span className="block font-semibold text-text">{c.name}</span>
                    <span className="text-caption whitespace-nowrap text-text-muted">
                      {formatPhone(c.phone)}
                    </span>
                  </span>
                </button>
              </th>
              <td className="p-md whitespace-nowrap text-text">
                {c.lastVisitAt ? longDate(c.lastVisitAt, tz) : 'Ainda não veio'}
              </td>
              <td className="p-md whitespace-nowrap text-text">{c.professionalName}</td>
              <td className="p-md text-text">{c.visitsCount}</td>
              <td className="p-md text-text">{c.noShowCount}</td>
              <td className="p-md">
                {c.onWaitlist ? (
                  <span className="inline-flex items-center gap-xs rounded-pill bg-success px-md py-xs font-semibold text-on-success">
                    <Icon name="check" className="size-4" /> Sim
                  </span>
                ) : (
                  <span className="text-text">Não</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientDetail({
  client: c,
  tz,
  onClose,
}: {
  client?: SalonClient;
  tz: string;
  onClose: () => void;
}) {
  if (!c)
    return (
      <aside className={`${card} hidden self-start p-xl text-body-small text-text-muted xl:block`}>
        Escolha um cliente na lista para ver os detalhes.
      </aside>
    );
  return (
    <aside
      aria-label={`Detalhes de ${c.name}`}
      className={`${card} relative self-start p-xl xl:sticky xl:top-xl`}
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute top-md right-md rounded-md p-sm text-text-muted hover:text-text"
      >
        <Icon name="close" />
      </button>
      <div className="flex items-center gap-lg pr-xl">
        <Avatar name={c.name} size="lg" />
        <div>
          <h2 className="text-title text-text">{c.name}</h2>
          <p className="text-body-small text-text">{formatPhone(c.phone)}</p>
        </div>
      </div>
      <dl className="mt-xl space-y-lg border-t border-border pt-lg text-body-small">
        <Row icon="clock" label="Visitas" value={String(c.visitsCount)} />
        <Row
          icon="calendar"
          label="Último atendimento"
          value={
            c.lastVisitAt
              ? `${longDate(c.lastVisitAt, tz)}${c.lastServiceName ? ` · ${c.lastServiceName}` : ''}`
              : 'Ainda não veio'
          }
        />
        <Row icon="user" label="Profissional" value={c.professionalName} />
        <Row icon="close" label="Faltas" value={String(c.noShowCount)} />
      </dl>
      <div className="mt-xl border-t border-border pt-lg">
        <h3 className="flex items-center gap-sm text-heading text-text">
          <Icon name="clock" /> Preferências
        </h3>
        {c.preferences.notes.length ? (
          <ul className="mt-md flex flex-wrap gap-sm">
            {c.preferences.notes.map((n) => (
              <li
                key={n}
                className="rounded-pill bg-accent px-md py-xs text-body-small font-semibold text-on-accent"
              >
                {n}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-xs text-body-small text-text-muted">Nenhuma preferência anotada.</p>
        )}
      </div>
    </aside>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: 'clock' | 'calendar' | 'user' | 'close';
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-md">
      <Icon name={icon} className="mt-xs size-5 text-text-muted" />
      <div>
        <dt className="text-text-muted">{label}</dt>
        <dd className="font-semibold text-text">{value}</dd>
      </div>
    </div>
  );
}
