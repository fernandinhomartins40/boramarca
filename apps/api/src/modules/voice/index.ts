import type { FastifyPluginAsync } from 'fastify';
import { firstName, spokenTimeOf } from '@boramarca/ia';
import { routes } from '@boramarca/shared';
import { loadPro } from '../../lib/core';
import { route } from '../../lib/route';
import { addDays, todayIn } from '../../lib/time';
import { createVoice } from './service';

const joinNames = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const reais = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/** POST /voice/command and GET /voice/summary (plan sections 8 and 9; target: 3 s). */
const voice: FastifyPluginAsync = async (app) => {
  const v = routes.voice;
  const db = app.db;

  const voiceSvc = createVoice(app);

  route(app, v.command, async (req) => voiceSvc.command(req.scope.professionalId, req.body));

  route(app, v.summary, async (req) => {
    const pid = req.scope.professionalId;
    const { moment } = req.query;
    const pro = await loadPro(db, pid);
    const tz = pro.salon.timezone;
    const day = await app.agenda.getDay(pid, todayIn(tz, app.now()));
    const pending = await app.messaging.decisions.list(pid, 'pending', 50);
    const active = day.appointments.filter((a) =>
      ['scheduled', 'confirmed', 'in_service'].includes(a.status),
    );
    const decisions =
      pending.length === 0
        ? ''
        : pending.length === 1
          ? ' Tem 1 decisão esperando você.'
          : ` Tem ${pending.length} decisões esperando você.`;
    let speech: string;
    if (moment === 'open') {
      const first = active[0];
      speech =
        active.length === 0
          ? 'Bom dia! Você não tem clientes marcados hoje.'
          : `Bom dia! Hoje você tem ${active.length} ${active.length === 1 ? 'cliente' : 'clientes'}. ` +
            `O primeiro é ${firstName(first!.clientName)}, às ${spokenTimeOf(first!.startsAt, tz)}.`;
      speech += decisions;
    } else {
      const done = day.appointments.filter((a) => a.status === 'done');
      const total = done.reduce((n, a) => n + a.priceCents, 0);
      const noShows = day.appointments.filter((a) => a.status === 'no_show').length;
      const tomorrow = await app.agenda.getDay(pid, addDays(todayIn(tz, app.now()), 1));
      const next = tomorrow.appointments.filter((a) =>
        ['scheduled', 'confirmed'].includes(a.status),
      );
      speech =
        done.length === 0
          ? 'Hoje você não concluiu atendimentos.'
          : `Hoje você atendeu ${joinNames(done.length, 'cliente', 'clientes')}, somando ${reais(total)}.`;
      if (noShows) speech += ` ${joinNames(noShows, 'falta', 'faltas')}.`;
      speech +=
        next.length === 0
          ? ' Amanhã ainda não tem ninguém marcado.'
          : ` Amanhã você tem ${joinNames(next.length, 'cliente', 'clientes')}, o primeiro às ${spokenTimeOf(next[0]!.startsAt, tz)}.`;
      speech += decisions;
    }
    return { moment, speech };
  });
};

export default voice;
