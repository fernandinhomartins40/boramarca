'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  PROFESSION_LABELS,
  routes,
  type AppointmentStatus,
  type AppointmentView,
  type SalonDayResponse,
} from '@boramarca/shared';
import { ApiCallError } from '@/lib/api';
import { movedStart, rescheduleAppointment } from './actions';
import { DecisionsAside } from './DecisionsAside';
import {
  addDays,
  dayLabel,
  firstName,
  minutesIn,
  timeIn,
  todayIn,
  toMinutes,
  WEEKDAY_SHORT,
  weekDates,
  weekdayOf,
} from './format';
import { useSession } from './PanelShell';
import { Async, Avatar, btnOutline, btnPrimary, card, Empty, errorText, Icon, useLoad } from './ui';

type Column = SalonDayResponse['columns'][number];

export const STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  scheduled: { label: 'Agendado', className: 'bg-surface-alt text-primary-text' },
  confirmed: { label: 'Confirmado', className: 'bg-success text-on-success' },
  in_service: { label: 'Atendendo', className: 'bg-primary text-on-primary' },
  done: { label: 'Concluído', className: 'bg-surface-alt text-text-muted' },
  no_show: { label: 'Faltou', className: 'bg-surface-alt text-danger' },
  cancelled: { label: 'Cancelado', className: 'bg-surface-alt text-text-muted' },
};

const visible = (a: AppointmentView) => a.status !== 'cancelled';
const HOUR_PX = 72;
const SNAP_MIN = 15;
/** Only appointments still ahead of the service can move. */
const movable = (a: AppointmentView) => a.status === 'scheduled' || a.status === 'confirmed';
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function AgendaPage() {
  const { api, me } = useSession();
  const tz = me.salon.timezone;
  const today = todayIn(tz);
  const [date, setDate] = useState(today);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [notice, setNotice] = useState<string>();
  const dates = view === 'day' ? [date] : weekDates(date);

  const days = useLoad(
    () => Promise.all(dates.map((d) => api.call(routes.salon.day, { query: { date: d } }))),
    [view, date],
    60_000,
  );
  const team = useLoad(() => api.call(routes.salon.team.list), []);
  const professionOf = (id: string) => {
    const p = team.data?.items.find((m) => m.id === id)?.professions[0];
    return p ? PROFESSION_LABELS[p] : '';
  };

  const first = days.data?.[0];
  const todayData = days.data?.find((d) => d.date === today);
  const appts = first ? first.columns.flatMap((c) => c.appointments).filter(visible) : [];
  const recoveredToday = todayData
    ? todayData.columns
        .flatMap((c) => c.appointments)
        .filter((a) => a.isFitIn && a.origin === 'ai' && visible(a)).length
    : null;

  return (
    <div className="grid gap-xl xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <p className="text-body-small text-text-muted">{me.salon.name}</p>
        {view === 'day' && first && (
          <dl
            className={`${card} mt-md grid grid-cols-1 gap-lg bg-surface-alt/60 p-lg sm:grid-cols-3`}
          >
            <Stat
              icon="calendar"
              value={appts.length}
              label="atendimentos"
              sub="na agenda do dia"
            />
            <Stat
              icon="check"
              value={appts.filter((a) => a.status === 'confirmed').length}
              label="confirmados"
              sub="pelos clientes"
            />
            <Stat
              icon="chat"
              value={first.pendingDecisions.length}
              label={first.pendingDecisions.length === 1 ? 'decisão' : 'decisões'}
              sub={
                first.pendingDecisions.length === 1 ? 'precisa de resposta' : 'precisam de resposta'
              }
            />
          </dl>
        )}
        <h1 className="mt-xl text-display text-text">Agenda da equipe</h1>
        <div className="mt-lg flex flex-wrap items-center gap-md">
          <button
            type="button"
            className={`${btnOutline} px-md`}
            aria-label={view === 'day' ? 'Dia anterior' : 'Semana anterior'}
            onClick={() => setDate(addDays(date, view === 'day' ? -1 : -7))}
          >
            <Icon name="left" />
          </button>
          <p className="min-w-44 text-center text-heading text-text" aria-live="polite">
            {view === 'day'
              ? dayLabel(date)
              : `${dayLabel(dates[0]!)} – ${dayLabel(dates[6]!).split(', ')[1]}`}
          </p>
          <button
            type="button"
            className={`${btnOutline} px-md`}
            aria-label={view === 'day' ? 'Próximo dia' : 'Próxima semana'}
            onClick={() => setDate(addDays(date, view === 'day' ? 1 : 7))}
          >
            <Icon name="right" />
          </button>
          <button
            type="button"
            className={`${btnOutline} border-primary text-primary-text`}
            onClick={() => setDate(today)}
          >
            Hoje
          </button>
          <div
            role="group"
            aria-label="Visão"
            className="ml-auto flex rounded-md bg-surface-alt p-xs"
          >
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className="min-h-9 rounded-sm px-lg text-body-small font-semibold text-text aria-pressed:bg-primary aria-pressed:text-on-primary"
              >
                {v === 'day' ? 'Dia' : 'Semana'}
              </button>
            ))}
          </div>
        </div>
        {notice && (
          <p
            role="status"
            className="mt-lg rounded-lg bg-success p-lg text-body-small text-on-success"
          >
            {notice}
          </p>
        )}
        <div className="mt-lg">
          <Async state={days}>
            {(data) =>
              !data[0]!.columns.length ? (
                <Empty title="Nenhum profissional no espaço">
                  Adicione a equipe na tela Equipe para ver a agenda aqui.
                </Empty>
              ) : view === 'day' ? (
                <DayGrid
                  day={data[0]!}
                  today={today}
                  tz={tz}
                  professionOf={professionOf}
                  onMoved={(msg) => {
                    setNotice(msg);
                    void days.reload();
                  }}
                />
              ) : (
                <WeekGrid
                  days={data}
                  tz={tz}
                  today={today}
                  onPick={(d) => {
                    setDate(d);
                    setView('day');
                  }}
                />
              )
            }
          </Async>
        </div>
      </div>
      <div className="order-first xl:order-none">
        <DecisionsAside
          decisions={first?.pendingDecisions}
          loading={days.loading && !first}
          recoveredToday={recoveredToday}
          professionalName={(id) =>
            first?.columns.find((c) => c.professional.id === id)?.professional.name ?? ''
          }
          onAnswered={() => void days.reload()}
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  sub,
}: {
  icon: 'calendar' | 'check' | 'chat';
  value: number;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-md">
      <span className="grid size-11 place-items-center rounded-pill bg-surface text-primary-text">
        <Icon name={icon} />
      </span>
      <div>
        <dt className="sr-only">{label}</dt>
        <dd className="text-heading text-text">
          {value} {label}
        </dd>
        <dd className="text-body-small text-text-muted">{sub}</dd>
      </div>
    </div>
  );
}

function bounds(cols: Column[], tz: string) {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const c of cols) {
    if (c.workingHours) {
      starts.push(toMinutes(c.workingHours.start));
      ends.push(toMinutes(c.workingHours.end));
    }
    for (const a of c.appointments.filter(visible)) {
      starts.push(minutesIn(a.startsAt, tz));
      ends.push(minutesIn(a.endsAt, tz) || 24 * 60);
    }
  }
  const s = starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 8 * 60;
  const e = ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 19 * 60;
  return { start: s, end: Math.max(e, s + 60) };
}

function DayGrid({
  day,
  today,
  tz,
  professionOf,
  onMoved,
}: {
  day: SalonDayResponse;
  today: string;
  tz: string;
  professionOf: (id: string) => string;
  onMoved: (message: string) => void;
}) {
  const { start, end } = bounds(day.columns, tz);
  const y = (min: number) => ((min - start) / 60) * HOUR_PX;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const nowMin = day.date === today ? minutesIn(new Date().toISOString(), tz) : null;
  const showNow = nowMin !== null && nowMin >= start && nowMin <= end;
  const height = y(end);
  const [move, setMove] = useState<{ a: AppointmentView; to: number }>();
  // Drag stays inside the column: the salon reschedule route keeps the professional.
  const drag = useRef<{ a: AppointmentView; col: string; grabY: number }>(undefined);

  return (
    <div className={`${card} overflow-x-auto p-md`}>
      <div className="min-w-fit">
        <div className="flex gap-sm pl-16">
          {day.columns.map((c) => (
            <div
              key={c.professional.id}
              className="flex min-w-36 flex-1 items-center gap-md rounded-md bg-surface-alt/60 p-md"
            >
              <span className="grid size-9 place-items-center rounded-pill bg-surface text-primary-text">
                <Icon name="user" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-text">{c.professional.name}</p>
                <p className="truncate text-body-small text-text-muted">
                  {professionOf(c.professional.id) ||
                    (c.workingHours ? '' : 'Não atende neste dia')}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-md flex gap-sm pl-16" style={{ height }}>
          {hours.map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute inset-x-0 border-t border-border"
              style={{ top: y(h) }}
            >
              <span className="absolute -top-2.5 left-0 w-14 text-body-small text-text-muted">
                {`${String(h / 60).padStart(2, '0')}:00`}
              </span>
            </div>
          ))}
          {day.columns.map((c) => (
            <div
              key={c.professional.id}
              className="relative min-w-36 flex-1"
              onDragOver={(e) => {
                if (drag.current?.col === c.professional.id) e.preventDefault();
              }}
              onDrop={(e) => {
                const d = drag.current;
                drag.current = undefined;
                if (d?.col !== c.professional.id) return;
                e.preventDefault();
                const top = e.clientY - e.currentTarget.getBoundingClientRect().top - d.grabY - 2;
                const snapped = Math.round((start + (top / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
                const to = Math.min(Math.max(snapped, 0), 24 * 60 - SNAP_MIN);
                if (to !== minutesIn(d.a.startsAt, tz)) setMove({ a: d.a, to });
              }}
            >
              {!c.workingHours && (
                <div className="absolute inset-0 rounded-md bg-surface-alt/50" aria-hidden />
              )}
              {c.workingHours?.lunchStart && c.workingHours.lunchEnd && (
                <div
                  className="absolute inset-x-xs flex items-center gap-md rounded-md bg-surface-alt px-md text-text"
                  style={{
                    top: y(toMinutes(c.workingHours.lunchStart)) + 2,
                    height:
                      y(toMinutes(c.workingHours.lunchEnd)) -
                      y(toMinutes(c.workingHours.lunchStart)) -
                      4,
                  }}
                >
                  <Icon name="lunch" />
                  <span className="text-body-small">
                    <b className="block font-semibold">Almoço</b>
                    {c.workingHours.lunchStart} – {c.workingHours.lunchEnd}
                  </span>
                </div>
              )}
              {c.appointments.filter(visible).map((a) => {
                const top = y(minutesIn(a.startsAt, tz));
                const h = Math.max(y(minutesIn(a.endsAt, tz) || 24 * 60) - top - 4, 30);
                return (
                  <article
                    key={a.id}
                    draggable={movable(a)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', a.id);
                      e.dataTransfer.effectAllowed = 'move';
                      drag.current = {
                        a,
                        col: c.professional.id,
                        grabY: e.clientY - e.currentTarget.getBoundingClientRect().top,
                      };
                    }}
                    onDragEnd={() => {
                      drag.current = undefined;
                    }}
                    className={`absolute inset-x-xs overflow-hidden rounded-md border border-border px-md py-xs ${
                      a.isFitIn ? 'bg-accent-soft' : 'bg-surface'
                    } ${movable(a) ? 'cursor-grab focus-within:outline-2 focus-within:outline-primary' : ''}`}
                    style={{ top: top + 2, height: h }}
                  >
                    {movable(a) && (
                      // Keyboard path to the same move: the card opens the reschedule dialog.
                      <button
                        type="button"
                        className="absolute inset-0 cursor-grab focus:outline-none"
                        title="Arraste para outro horário ou clique para remarcar"
                        aria-label={`Remarcar ${a.clientName}, ${timeIn(a.startsAt, tz)}`}
                        onClick={() => setMove({ a, to: minutesIn(a.startsAt, tz) })}
                      />
                    )}
                    <div className="flex items-start justify-between gap-xs">
                      {/* Start time only: the card height already shows the duration. */}
                      <p
                        className="text-caption whitespace-nowrap text-text"
                        title={`${timeIn(a.startsAt, tz)} – ${timeIn(a.endsAt, tz)}`}
                      >
                        {timeIn(a.startsAt, tz)}
                        <span className="sr-only"> até {timeIn(a.endsAt, tz)}</span>
                      </p>
                      <span
                        className={`rounded-pill px-sm text-caption font-semibold ${STATUS[a.status].className}`}
                      >
                        {STATUS[a.status].label}
                      </span>
                    </div>
                    <p className="truncate text-body-small font-bold text-text">{a.clientName}</p>
                    <p className="truncate text-caption text-text-muted">
                      {a.isFitIn ? 'Encaixe · ' : ''}
                      {a.services.map((s) => s.name).join(', ')}
                    </p>
                  </article>
                );
              })}
            </div>
          ))}
          {showNow && (
            <div
              className="pointer-events-none absolute right-0 left-0 z-10 flex items-center"
              style={{ top: y(nowMin) }}
              aria-hidden
            >
              <span className="rounded-pill bg-primary px-sm text-caption font-semibold text-on-primary">
                {timeIn(new Date().toISOString(), tz)}
              </span>
              <span className="h-0.5 flex-1 bg-primary" />
            </div>
          )}
        </div>
      </div>
      {move && (
        <RescheduleDialog
          appointment={move.a}
          to={move.to}
          tz={tz}
          onClose={() => setMove(undefined)}
          onDone={(msg) => {
            setMove(undefined);
            onMoved(msg);
          }}
        />
      )}
    </div>
  );
}

/** Confirmation before saving a move (from a drag or from the card's button). */
function RescheduleDialog({
  appointment: a,
  to,
  tz,
  onClose,
  onDone,
}: {
  appointment: AppointmentView;
  to: number;
  tz: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { api } = useSession();
  const ref = useRef<HTMLDialogElement>(null);
  const [time, setTime] = useState(hhmm(to));
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const from = timeIn(a.startsAt, tz);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!time) return setError('Escolha o novo horário.');
    if (time === from) return setError('Escolha um horário diferente do atual.');
    setBusy(true);
    setError(undefined);
    try {
      const startsAt = movedStart(a.startsAt, minutesIn(a.startsAt, tz), toMinutes(time));
      await rescheduleAppointment(api, a.id, startsAt, notify);
      onDone(`${a.clientName} remarcado para ${time}.`);
    } catch (err) {
      setError(
        err instanceof ApiCallError && err.status === 409
          ? `Não deu para remarcar para ${time}: ${err.message}. Escolha outro horário.`
          : errorText(err),
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="remarcar-titulo"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-xl text-text backdrop:bg-brand-grafite/50"
    >
      <form onSubmit={submit} className="space-y-lg">
        <h2 id="remarcar-titulo" className="text-heading">
          Remarcar {a.clientName}?
        </h2>
        <p className="text-body-small text-text-muted">
          {a.services.map((s) => s.name).join(', ')} · marcado às {from}
        </p>
        <label className="block text-body-small font-semibold">
          Novo horário
          <input
            type="time"
            step={SNAP_MIN * 60}
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-xs block min-h-11 w-full rounded-md border border-border bg-surface px-md text-body text-text"
          />
        </label>
        <label className="flex items-center gap-md text-body-small">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="size-5 accent-[var(--color-primary)]"
          />
          Avisar o cliente pelo WhatsApp
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-surface-alt p-md text-body-small text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-md">
          <button type="button" className={btnOutline} onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? 'Salvando…' : `Remarcar para ${time || '…'}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function WeekGrid({
  days,
  tz,
  today,
  onPick,
}: {
  days: SalonDayResponse[];
  tz: string;
  today: string;
  onPick: (date: string) => void;
}) {
  const pros = days[0]!.columns.map((c) => c.professional);
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
        <caption className="sr-only">Agenda da semana por profissional</caption>
        <thead>
          <tr>
            <th scope="col" className="w-28 p-md text-body-small font-semibold text-text-muted">
              Profissional
            </th>
            {days.map((d) => {
              const n = d.columns.flatMap((c) => c.appointments).filter(visible).length;
              return (
                <th key={d.date} scope="col" className="p-sm">
                  <button
                    type="button"
                    onClick={() => onPick(d.date)}
                    className={`w-full rounded-md p-sm text-left hover:bg-surface-alt ${
                      d.date === today ? 'bg-surface-alt' : ''
                    }`}
                  >
                    <span className="block text-body-small font-bold text-text">
                      {WEEKDAY_SHORT[weekdayOf(d.date)]} {Number(d.date.slice(8))}
                    </span>
                    <span className="text-caption text-text-muted">
                      {n} {n === 1 ? 'atendimento' : 'atendimentos'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {pros.map((p) => (
            <tr key={p.id} className="border-t border-border align-top">
              <th scope="row" className="p-md">
                <span className="flex items-center gap-sm">
                  <Avatar name={p.name} size="sm" />
                  <span className="truncate text-body-small font-semibold text-text">
                    {firstName(p.name)}
                  </span>
                </span>
              </th>
              {days.map((d) => {
                const col = d.columns.find((c) => c.professional.id === p.id);
                const list = col?.appointments.filter(visible) ?? [];
                return (
                  <td key={d.date} className="p-xs">
                    {!col?.workingHours && !list.length ? (
                      <p className="p-xs text-caption text-text-muted">Não atende</p>
                    ) : !list.length ? (
                      <p className="p-xs text-caption text-text-muted">Livre</p>
                    ) : (
                      <ul className="space-y-xs">
                        {list.map((a) => (
                          <li
                            key={a.id}
                            className={`rounded-sm border border-border px-sm py-xs text-caption ${
                              a.isFitIn ? 'bg-accent-soft' : 'bg-surface'
                            }`}
                            title={`${STATUS[a.status].label} · ${a.services.map((s) => s.name).join(', ')}`}
                          >
                            <b className="font-semibold text-text">{timeIn(a.startsAt, tz)}</b>{' '}
                            <span className="text-text">{firstName(a.clientName)}</span>
                            {a.status === 'confirmed' && (
                              <Icon
                                name="check"
                                className="ml-xs inline size-3.5 text-primary-text"
                              />
                            )}
                            {a.status === 'confirmed' && (
                              <span className="sr-only"> (confirmado)</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
