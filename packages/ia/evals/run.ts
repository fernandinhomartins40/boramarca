// Evaluation against the real LLM (plan section 15). Outside the quality gate: runs only with keys.
// Usage: pnpm eval   (reads LLM_PRIMARY_* / LLM_FALLBACK_* from the environment)
import { HEALTH_PROFESSIONS } from '@boramarca/shared';
import { buildContext, createLlmClientFromEnv, interpretClientMessage } from '../src/index';
import { at, IDS, makeInput } from '../src/fixtures';
import { CASES } from './cases';

const MIN_ACCURACY = 0.8;

const llm = createLlmClientFromEnv(process.env, { timeoutMs: 30_000 });
if (!llm) {
  console.log(
    '[eval] LLM_PRIMARY_BASE_URL / LLM_PRIMARY_API_KEY / LLM_PRIMARY_MODEL ausentes: avaliação pulada. ' +
      'Veja packages/ia/README.md para configurar.',
  );
  process.exit(0);
}

const healthServices = [
  { id: IDS.corte, name: 'Consulta', durationMinutes: 50, priceCents: 20000 },
  { id: IDS.barba, name: 'Avaliação', durationMinutes: 30, priceCents: 15000 },
];

let passed = 0;
for (const c of CASES) {
  const input = makeInput(c.text, {
    professions: [c.profession],
    message: { text: c.text, transcribedFromAudio: c.transcribedFromAudio },
  });
  if (HEALTH_PROFESSIONS.includes(c.profession)) input.services = healthServices;
  if (c.hasAppointment) {
    input.client.upcoming = [
      { id: IDS.apptFulano, startsAt: at('15:00'), serviceNames: [input.services[0]!.name] },
    ];
    input.day.appointments = input.day.appointments
      .filter((a) => a.id !== IDS.apptCarlos)
      .concat({
        id: IDS.apptFulano,
        clientId: IDS.fulano,
        clientName: 'Fulano de Tal',
        startsAt: at('15:00'),
        endsAt: at('15:30'),
        serviceNames: [input.services[0]!.name],
        status: 'scheduled',
      });
  }
  const started = Date.now();
  const res = await interpretClientMessage(buildContext(input), llm);
  const names = res.calls.map((x) => x.name);
  // The safety fallback (model down or invalid twice) never counts as a pass.
  const fellBack = res.note.startsWith('Entendi como: não consegui interpretar');
  const ok = !fellBack && names.some((n) => c.expect.includes(n));
  if (ok) passed++;
  console.log(
    `${ok ? 'OK  ' : 'FALHA'} ${c.id.padEnd(4)} ${c.area.padEnd(6)} ${c.category.padEnd(15)} ${String(Date.now() - started).padStart(5)} ms  ${names.join(', ')}  | ${res.note}` +
      (ok ? '' : `\n       esperado: ${c.expect.join(' | ')} — "${c.text}"`),
  );
}

const accuracy = passed / CASES.length;
console.log(
  `\n[eval] ${passed}/${CASES.length} (${(accuracy * 100).toFixed(0)}%) — mínimo ${MIN_ACCURACY * 100}%`,
);
process.exit(accuracy >= MIN_ACCURACY ? 0 : 1);
