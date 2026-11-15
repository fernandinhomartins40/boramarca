import { z } from 'zod';
import { DateOnly, Id, IsoDateTime } from './common';
import { DayPeriod, WaitlistPreference } from './waitlist';

/**
 * Parameters of the 10 AI tools (plan section 5). Names are pt-BR by design.
 * The AI never sees phones: clients are referred to by id, appointments by id,
 * services by id (all given in the reduced context built by `packages/ia`).
 * The backend validates every call with these schemas and runs it through the rule engine.
 */

export const ListarAgendaParams = z.object({ date: DateOnly });
export const BuscarVagasParams = z.object({
  date: DateOnly,
  serviceIds: z.array(Id).min(1),
  period: DayPeriod.optional(),
});
/** Books the current conversation's client. */
export const MarcarParams = z.object({
  serviceIds: z.array(Id).min(1),
  startsAt: IsoDateTime,
  isFitIn: z.boolean().default(false),
});
export const RemarcarParams = z.object({ appointmentId: Id, startsAt: IsoDateTime });
export const CancelarParams = z.object({
  appointmentId: Id,
  reason: z.string().max(200).optional(),
});
/** Message to another known client (never a phone number); goes through the send guard. */
export const EnviarWhatsappParams = z.object({ clientId: Id, text: z.string().min(1).max(1000) });
export const EntrarListaDeEsperaParams = z.object({
  serviceId: Id.nullable(),
  preference: WaitlistPreference,
});
export const ConfirmarPresencaParams = z.object({ appointmentId: Id });
/** Reply to the client of the current conversation. */
export const ResponderClienteParams = z.object({ text: z.string().min(1).max(1000) });

const call = <N extends string, P extends z.ZodType>(name: N, params: P) =>
  z.object({ name: z.literal(name), arguments: params });

/** Tools that act; they can be proposed inside a Decision (as `proposedAction` or an option's action). */
export const AgendaActionCall = z.discriminatedUnion('name', [
  call('marcar', MarcarParams),
  call('remarcar', RemarcarParams),
  call('cancelar', CancelarParams),
  call('enviar_whatsapp', EnviarWhatsappParams),
  call('entrar_lista_de_espera', EntrarListaDeEsperaParams),
  call('confirmar_presenca', ConfirmarPresencaParams),
  call('responder_cliente', ResponderClienteParams),
]);
export type AgendaActionCall = z.infer<typeof AgendaActionCall>;

export const DecisionTypeForTool = z.enum([
  'encaixe',
  'novo_horario',
  'remarcar',
  'atraso',
  'duvida',
]);

export const PerguntarAoProfissionalParams = z.object({
  type: DecisionTypeForTool,
  question: z.string().min(1).max(300),
  options: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().min(1).max(60),
        action: AgendaActionCall.nullable(),
      }),
    )
    .min(1)
    .max(3),
  proposedAction: AgendaActionCall.nullable(),
  /** What the client is told while waiting ("Vou ver aqui e já te falo"). */
  holdingReply: z.string().max(300).optional(),
});

export const AI_TOOL_PARAMS = {
  listar_agenda: ListarAgendaParams,
  buscar_vagas: BuscarVagasParams,
  marcar: MarcarParams,
  remarcar: RemarcarParams,
  cancelar: CancelarParams,
  enviar_whatsapp: EnviarWhatsappParams,
  entrar_lista_de_espera: EntrarListaDeEsperaParams,
  confirmar_presenca: ConfirmarPresencaParams,
  perguntar_ao_profissional: PerguntarAoProfissionalParams,
  responder_cliente: ResponderClienteParams,
} as const;

export type AiToolName = keyof typeof AI_TOOL_PARAMS;
export const AI_TOOL_NAMES = Object.keys(AI_TOOL_PARAMS) as AiToolName[];
export const AiToolNameSchema = z.enum(AI_TOOL_NAMES as [AiToolName, ...AiToolName[]]);

/** Short pt-BR descriptions for the LLM tool definitions. */
export const AI_TOOL_DESCRIPTIONS: Record<AiToolName, string> = {
  listar_agenda: 'Lista os horários ocupados e livres de um dia.',
  buscar_vagas: 'Busca horários livres em um dia para os serviços pedidos.',
  marcar: 'Marca um horário para o cliente desta conversa.',
  remarcar: 'Muda um agendamento para outro horário.',
  cancelar: 'Cancela um agendamento.',
  enviar_whatsapp: 'Envia uma mensagem a outro cliente conhecido.',
  entrar_lista_de_espera: 'Coloca o cliente desta conversa na lista de espera, quando ele pediu.',
  confirmar_presenca: 'Confirma a presença do cliente em um agendamento.',
  perguntar_ao_profissional: 'Cria uma decisão para o profissional responder antes de agir.',
  responder_cliente: 'Responde ao cliente desta conversa.',
};

/** Any tool call returned by the LLM, validated. */
export const AiToolCall = z.discriminatedUnion('name', [
  call('listar_agenda', ListarAgendaParams),
  call('buscar_vagas', BuscarVagasParams),
  ...AgendaActionCall.options,
  call('perguntar_ao_profissional', PerguntarAoProfissionalParams),
]);
export type AiToolCall = z.infer<typeof AiToolCall>;

/** What `packages/ia` returns for one inbound message. */
export const AiTurnResult = z.object({
  /** Saved in `messages.ai_note`: "Entendi como: pedido de horário para sábado de manhã". */
  note: z.string().max(200),
  calls: z.array(AiToolCall).min(1),
});
export type AiTurnResult = z.infer<typeof AiTurnResult>;

// ---- Added by A3 (packages/ia): professional's free-text answer to a Decision, as an action.
export const ProfessionalAnswerSource = z.enum(['rule', 'llm']);
/**
 * Output of `interpretProfessionalAnswer` ("pode, mas marca daqui 15 minutos").
 * `accept.action` already carries the adjusted time; the backend still checks conflicts.
 * `decline.action` is the chosen option's action, if the declining option had one.
 */
export const ProfessionalAnswer = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('accept'),
    optionId: z.string().nullable(),
    action: AgendaActionCall.nullable(),
    source: ProfessionalAnswerSource,
  }),
  z.object({
    kind: z.literal('decline'),
    optionId: z.string().nullable(),
    action: AgendaActionCall.nullable(),
    source: ProfessionalAnswerSource,
  }),
  z.object({ kind: z.literal('take_over'), source: ProfessionalAnswerSource }),
  z.object({ kind: z.literal('unknown'), source: ProfessionalAnswerSource }),
]);
export type ProfessionalAnswer = z.infer<typeof ProfessionalAnswer>;
