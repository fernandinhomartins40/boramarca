// Verificação apenas (scripts/verificar-fluxo.mjs): a API de verdade, com FakeGateway (sem
// Evolution), um FakeLlm roteirizado com as respostas do fluxo de exemplo do PDF e um relógio
// ajustável. Sem chave nenhuma. Nunca usar em produção: recusa NODE_ENV=production.
import { FakeLlm, toolReply, type LlmRequest } from '@boramarca/ia';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { zonedToUtc } from '../src/lib/time';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('api-fluxo: só fora de produção');

const TZ = 'America/Sao_Paulo';
const DATE = process.env.FLUXO_DATE ?? '2030-03-09';
const at = (hhmm: string) => zonedToUtc(DATE, hhmm, TZ).toISOString();

// Relógio: corre em tempo real a partir do horário que o roteiro manda (POST /__fluxo/relogio).
let offset = zonedToUtc(DATE, '09:00', TZ).getTime() - Date.now();
const now = () => new Date(Date.now() + offset);

const allText = (req: LlmRequest) =>
  req.messages
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
const pick = (req: LlmRequest, re: RegExp) => {
  const m = allText(req).match(re);
  if (!m) throw new Error(`api-fluxo: ${re} não está no contexto`);
  return m[1]!;
};
const serviceId = (req: LlmRequest) => pick(req, /serviceId (\S+)/);
const log = (msg: string) => console.log(`[fluxo-llm] ${msg}`);

const llm = new FakeLlm()
  // Passo 7: pedido sem resposta do profissional.
  .on(/quero marcar às 16h/, (req) =>
    toolReply(
      { name: 'marcar', arguments: { serviceIds: [serviceId(req)], startsAt: at('16:00') } },
      'Entendi como: pedido de horário às 16h',
    ),
  )
  // Passo 3: "tem horário hoje à tarde?" -> pergunta ao profissional se marca às 15h.
  .on(/tem horário hoje à tarde\?/, (req) => {
    const ctx = allText(req);
    log(`contexto do passo 3 mostra a vaga das 15h: ${/Vagas livres hoje: .*15h/.test(ctx)}`);
    log(`contexto do passo 3 sem telefone: ${!/\+?55\d{10,11}/.test(ctx)}`);
    const marcar15 = {
      name: 'marcar' as const,
      arguments: { serviceIds: [serviceId(req)], startsAt: at('15:00') },
    };
    return toolReply(
      {
        name: 'perguntar_ao_profissional',
        arguments: {
          type: 'novo_horario',
          question:
            'Fulano quer horário hoje à tarde. O Carlos das 15h desmarcou. Posso marcar o Fulano às 15h?',
          options: [
            { id: 'sim', label: 'Sim', action: marcar15 },
            { id: 'nao', label: 'Não', action: null },
          ],
          proposedAction: marcar15,
        },
      },
      'Entendi como: pedido de horário para hoje à tarde',
    );
  })
  // Passos 1–2: Carlos cancela o horário das 15h.
  .on(/não vou conseguir ir hoje às 15h/, (req) =>
    toolReply(
      [
        { name: 'cancelar', arguments: { appointmentId: pick(req, /appointmentId (\S+)/) } },
        {
          name: 'responder_cliente',
          arguments: {
            text: 'Tranquilo, Carlos! Cancelei seu horário de hoje às 15h. Quer remarcar?',
          },
        },
      ],
      'Entendi como: cancelamento do horário de hoje às 15h',
    ),
  );

const app = await buildApp(config, { llm, now });

// Só existe neste lançador de verificação.
app.post('/__fluxo/relogio', async (req) => {
  const { hhmm } = req.body as { hhmm: string };
  offset = zonedToUtc(DATE, hhmm, TZ).getTime() - Date.now();
  return { now: now().toISOString() };
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => void app.close().then(() => process.exit(0)));

await app.listen({ host: '127.0.0.1', port: config.PORT });
console.log(`[api-fluxo] pronta na porta ${config.PORT}, data simulada ${DATE}`);
