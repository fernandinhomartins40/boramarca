'use client';

import { useState } from 'react';
import { routes, type SalonReportsResponse } from '@boramarca/shared';
import {
  money,
  monthLong,
  monthsBack,
  monthShort,
  pct,
  todayIn,
  WEEK_ORDER,
  WEEKDAY_SHORT,
} from './format';
import { useSession } from './PanelShell';
import { Async, card, Empty, Icon, PageHeader, useLoad, type IconName } from './ui';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const occupancy = (r: SalonReportsResponse) =>
  avg(r.occupancyByProfessional.map((p) => p.occupancyRate));
/** Tinted cell: primary mixed into surface-alt (tokens only). */
const tint = (share: number) => ({
  backgroundColor: `color-mix(in srgb, var(--color-primary) ${Math.round(share * 100)}%, var(--color-surface-alt))`,
});

export function ReportsPage() {
  const { api, me } = useSession();
  const current = todayIn(me.salon.timezone).slice(0, 7);
  const [month, setMonth] = useState(current);
  const series = monthsBack(month, 6);
  const state = useLoad(
    () => Promise.all(series.map((m) => api.call(routes.salon.reports, { query: { month: m } }))),
    [month],
  );

  return (
    <>
      <PageHeader
        title="O tempo que voltou para sua agenda"
        actions={
          <label className="flex items-center gap-sm text-body-small text-text">
            <Icon name="calendar" />
            <span className="sr-only">Mês</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="min-h-11 rounded-md border border-border bg-surface px-md text-body text-text"
            >
              {monthsBack(current, 12)
                .reverse()
                .map((m) => (
                  <option key={m} value={m}>
                    {monthLong(m)}
                  </option>
                ))}
            </select>
          </label>
        }
      />
      <Async state={state}>{(all) => <Reports all={all} />}</Async>
    </>
  );
}

function Reports({ all }: { all: SalonReportsResponse[] }) {
  const r = all.at(-1)!;
  const prev = all.at(-2)!;
  const pp = (a: number, b: number) => Math.round((a - b) * 100);
  return (
    <div className="space-y-lg">
      <section className="flex flex-wrap items-center gap-xl rounded-lg bg-brand-grafite p-xl text-brand-neutro md:px-xxl">
        <span className="grid size-16 place-items-center rounded-md bg-primary text-on-primary">
          <Icon name="calendar" className="size-9" />
        </span>
        <div>
          <p className="text-display md:text-hero text-brand-lima">
            {r.recoveredFitInsCount}{' '}
            {r.recoveredFitInsCount === 1 ? 'horário recuperado' : 'horários recuperados'}
          </p>
          <p className="mt-xs text-heading">
            {money(r.recoveredValueCents)} em atendimentos que ficariam vagos
          </p>
        </div>
      </section>

      <div
        className={`grid gap-lg sm:grid-cols-2 ${r.appointmentsDoneCount === undefined ? 'xl:grid-cols-3' : 'xl:grid-cols-4'}`}
      >
        {r.appointmentsDoneCount !== undefined && (
          <Kpi
            icon="check"
            label="Atendimentos concluídos"
            value={String(r.appointmentsDoneCount)}
            delta={r.appointmentsDoneCount - (prev.appointmentsDoneCount ?? 0)}
            unit=""
            goodWhenUp
          />
        )}
        <Kpi
          icon="calendar"
          label="Ocupação média"
          value={pct(occupancy(r))}
          delta={pp(occupancy(r), occupancy(prev))}
          unit=" p.p."
          goodWhenUp
        />
        <Kpi
          icon="close"
          label="Faltas"
          value={pct(r.noShowRate)}
          delta={pp(r.noShowRate, prev.noShowRate)}
          unit=" p.p."
        />
        <Kpi
          icon="sparkle"
          label="Encaixes recuperados"
          value={String(r.recoveredFitInsCount)}
          delta={r.recoveredFitInsCount - prev.recoveredFitInsCount}
          unit=""
          goodWhenUp
        />
      </div>

      <div className="grid gap-lg xl:grid-cols-[3fr_2fr]">
        <section className={`${card} p-xl`}>
          <h2 className="text-heading text-text">Horários recuperados ao longo do tempo</h2>
          <p className="text-body-small text-text-muted">
            Encaixes e vagas da lista de espera preenchidas, mês a mês.
          </p>
          <LineChart
            points={all.map((x) => ({ label: monthShort(x.month), value: x.recoveredFitInsCount }))}
          />
        </section>
        <section className={`${card} p-xl`}>
          <h2 className="text-heading text-text">Ocupação por profissional</h2>
          <p className="text-body-small text-text-muted">Percentual da agenda preenchida no mês.</p>
          {r.occupancyByProfessional.length ? (
            <ul className="mt-lg space-y-lg">
              {[...r.occupancyByProfessional]
                .sort((a, b) => b.occupancyRate - a.occupancyRate)
                .map((p, i) => (
                  <li
                    key={p.professionalId}
                    className="grid grid-cols-[8rem_1fr_3rem] items-center gap-md"
                  >
                    <span className="truncate text-body-small text-text">{p.name}</span>
                    <span className="h-3 overflow-hidden rounded-pill bg-surface-alt">
                      <span
                        className={`block h-full rounded-pill ${i === 0 ? 'bg-accent' : 'bg-primary'}`}
                        style={{ width: pct(p.occupancyRate) }}
                      />
                    </span>
                    <span className="text-right text-body-small font-semibold text-text">
                      {pct(p.occupancyRate)}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-lg text-body-small text-text-muted">
              Sem expediente cadastrado no mês.
            </p>
          )}
        </section>
      </div>

      <Heatmap heatmap={r.heatmap} />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  delta,
  unit,
  goodWhenUp = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  delta: number;
  unit: string;
  goodWhenUp?: boolean;
}) {
  const good = delta === 0 || delta > 0 === goodWhenUp;
  return (
    <section className={`${card} flex items-start gap-lg p-xl`}>
      <Icon name={icon} className="mt-xs size-7 text-text" />
      <div>
        <h2 className="text-body text-text">{label}</h2>
        <p className="flex flex-wrap items-center gap-md">
          <span className="text-display text-text">{value}</span>
          <span
            className={`rounded-pill px-md py-xs text-caption font-semibold ${
              good ? 'bg-success text-on-success' : 'bg-surface-alt text-danger'
            }`}
          >
            {delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : ''}
            {delta}
            {unit}
          </span>
        </p>
        <p className="text-caption text-text-muted">vs. mês anterior</p>
      </div>
    </section>
  );
}

function LineChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 600;
  const H = 220;
  const pad = { l: 32, r: 24, t: 32, b: 32 };
  const max = Math.max(5, ...points.map((p) => p.value));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(points.length - 1, 1);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  return (
    <figure className="mt-lg">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby="linha-titulo"
      >
        <title id="linha-titulo">{points.map((p) => `${p.label}: ${p.value}`).join('; ')}</title>
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={pad.l}
            x2={W - pad.r}
            y1={y(max * f)}
            y2={y(max * f)}
            className="stroke-border"
          />
        ))}
        <path d={area} className="fill-primary/15" />
        <path d={line} fill="none" strokeWidth={3} className="stroke-primary" />
        {points.map((p, i) => {
          const last = i === points.length - 1;
          return (
            <g key={p.label}>
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={5}
                strokeWidth={2}
                className="fill-surface stroke-primary"
              />
              <rect
                x={x(i) - 16}
                y={y(p.value) - 30}
                width={32}
                height={20}
                rx={6}
                className={last ? 'fill-accent' : 'fill-surface-alt'}
              />
              <text
                x={x(i)}
                y={y(p.value) - 15}
                textAnchor="middle"
                className="fill-text text-caption font-bold"
              >
                {p.value}
              </text>
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-text-muted text-caption">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Heatmap({ heatmap }: { heatmap: SalonReportsResponse['heatmap'] }) {
  if (!heatmap.length)
    return (
      <Empty title="Sem dados de disponibilidade">
        O mapa aparece quando a equipe tiver expediente cadastrado no mês.
      </Empty>
    );
  const days = WEEK_ORDER.filter((d) => heatmap.some((h) => h.weekday === d));
  const hours = [...new Set(heatmap.map((h) => h.hour))].sort((a, b) => a - b);
  const at = (d: number, h: number) => heatmap.find((c) => c.weekday === d && c.hour === h);
  return (
    <section className={`${card} relative min-w-0 overflow-x-auto p-xl`}>
      <div className="flex flex-wrap items-end justify-between gap-lg">
        <div>
          <h2 className="text-heading text-text">Disponibilidade de horários</h2>
          <p className="text-body-small text-text-muted">
            Quanto mais escuro, mais horários livres na agenda da equipe.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-lg gap-y-sm text-caption text-text" aria-hidden>
          {[
            [0.1, 'Pouca disponibilidade'],
            [0.45, 'Média'],
            [0.9, 'Muita disponibilidade'],
          ].map(([v, l]) => (
            <li key={l} className="flex items-center gap-sm">
              <span className="size-4 rounded-sm" style={tint(v as number)} /> {l}
            </li>
          ))}
        </ul>
      </div>
      <table className="mt-lg w-full min-w-[36rem] border-separate border-spacing-xs">
        <thead>
          <tr>
            <th scope="col" className="w-20 text-left text-body-small font-semibold text-text">
              Horário
            </th>
            {days.map((d) => (
              <th key={d} scope="col" className="text-body-small font-semibold text-text">
                {WEEKDAY_SHORT[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h}>
              <th scope="row" className="text-left text-body-small font-normal text-text">
                {String(h).padStart(2, '0')}h
              </th>
              {days.map((d) => {
                const c = at(d, h);
                const free = c ? 1 - c.occupancyRate : 0;
                return (
                  <td key={d} className="h-7 rounded-sm" style={c ? tint(free) : undefined}>
                    <span className="sr-only">{c ? `${pct(free)} livre` : 'sem expediente'}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
