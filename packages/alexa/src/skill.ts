import {
  SkillBuilders,
  getAccountLinkingAccessToken,
  getIntentName,
  getRequestType,
  getSlotValue,
} from 'ask-sdk-core';
import type { ErrorHandler, HandlerInput, RequestHandler, Skill } from 'ask-sdk-core';
import type { Response } from 'ask-sdk-model';
import {
  ALEXA_RESPONSE_BUDGET_MS,
  VOICE_SAMPLE_QUESTIONS,
  type DecisionAnswerBody,
  type DecisionAnswerResponse,
  type DecisionView,
  type VoiceCommandBody,
  type VoiceCommandResponse,
} from '@boramarca/shared';

/**
 * Functions the API injects (the same ones behind `/voice/command` and `/decisions`).
 * Errors thrown with `code` (the API's `AppError`) are turned into spoken answers.
 */
export interface AlexaPorts {
  /** Account linking: the access token Amazon sends → professional id, or null if unknown/revoked. */
  professionalIdFromToken(accessToken: string): Promise<string | null>;
  /** Same as `POST /voice/command`. `signal` aborts when the 8-second budget runs out. */
  voiceCommand(
    professionalId: string,
    body: VoiceCommandBody,
    signal: AbortSignal,
  ): Promise<VoiceCommandResponse>;
  /** `decisions.list(professionalId, 'pending', limit)`: most urgent first. */
  listDecisions(professionalId: string, status: 'pending', limit: number): Promise<DecisionView[]>;
  /** `decisions.answer(...)` — `body.via` is always `'alexa'`. */
  answerDecision(
    professionalId: string,
    decisionId: string,
    body: DecisionAnswerBody,
  ): Promise<DecisionAnswerResponse>;
}

export interface AlexaSkillOptions {
  /** `ALEXA_SKILL_ID`; requests for another skill are rejected by the SDK. */
  skillId: string;
  ports: AlexaPorts;
  /** Time allowed for the API calls of one request; the rest of the 8 s covers network and verification. */
  timeoutMs?: number;
}

export const DEFAULT_ALEXA_TIMEOUT_MS = ALEXA_RESPONSE_BUDGET_MS - 2000;

export const SPEECH = {
  welcome:
    'Oi! Pode perguntar quantos clientes faltam, se tem horário vago, quem é o próximo ou se alguém mandou mensagem.',
  help: 'Você pode perguntar: quantos clientes ainda tenho hoje, tem horário vago, quem é o próximo ou alguém mandou mensagem. Para responder uma decisão, diga: sim, não, ou "diga ao Bora Marca que sim, para daqui 15 minutos".',
  bye: 'Até mais!',
  fallback: 'Não entendi.',
  linkAccount: 'Para usar o Bora Marca, vincule sua conta no app Alexa. Mandei um cartão para lá.',
  noDecision: 'Não tem nenhuma decisão esperando sua resposta.',
  decisionPrompt: 'Diga sim ou não.',
  notUnderstood: 'Não entendi a resposta. Pode repetir?',
  closed: 'Essa decisão já foi resolvida.',
  slowAgenda: 'A agenda está demorando para responder. Tente de novo daqui a pouco.',
  slowAnswer: 'Recebi sua resposta e ainda estou processando. Confira no app em instantes.',
  error: 'Não consegui falar com a agenda agora. Tente de novo daqui a pouco.',
} as const;

/** Agenda intents → the canonical question sent to `voiceCommand` (plan section 9). */
export const AGENDA_INTENTS: Record<string, string> = {
  ClientesRestantesIntent: VOICE_SAMPLE_QUESTIONS[0],
  HorariosVagosIntent: VOICE_SAMPLE_QUESTIONS[1],
  ProximoClienteIntent: VOICE_SAMPLE_QUESTIONS[2],
  NovasMensagensIntent: VOICE_SAMPLE_QUESTIONS[3],
};

export class BudgetExceeded extends Error {
  constructor() {
    super('alexa budget exceeded');
  }
}

/** Rejects with `BudgetExceeded` (and aborts `ctrl`) if `p` is not done in `ms`. */
export function withDeadline<T>(p: Promise<T>, ms: number, ctrl?: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => {
        ctrl?.abort();
        reject(new BudgetExceeded());
      },
      Math.max(0, ms),
    );
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e: unknown) => (clearTimeout(t), reject(e)),
    );
  });
}

const errCode = (e: unknown) => (e as { code?: unknown } | null)?.code;
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
const YES = /^(sim|pode|pode sim|claro|ok|beleza|confirma|confirmo)$/;
const NO = /^(nao|nao pode|negativo)$/;

/** "sim"/"não" pick the matching option deterministically (no AI call); anything else goes as text. */
export function answerBody(d: DecisionView, said: string): DecisionAnswerBody {
  const n = norm(said);
  const want = YES.test(n) ? 'sim' : NO.test(n) ? 'nao' : null;
  const opt = want && d.options.find((o) => norm(o.label).startsWith(want));
  return opt ? { optionId: opt.id, via: 'alexa' } : { text: said, via: 'alexa' };
}

export function createAlexaSkill(opts: AlexaSkillOptions): Skill {
  const { ports } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_ALEXA_TIMEOUT_MS;

  /** Per-request deadline shared by every API call of that request. */
  const deadline = (h: HandlerInput) => {
    const attrs = h.attributesManager.getRequestAttributes();
    attrs.deadline ??= Date.now() + timeoutMs;
    return attrs.deadline as number;
  };
  const call = <T>(h: HandlerInput, p: (signal: AbortSignal) => Promise<T>) => {
    const ctrl = new AbortController();
    return withDeadline(p(ctrl.signal), deadline(h) - Date.now(), ctrl);
  };

  const say = (h: HandlerInput, text: string, keepOpen?: string): Response => {
    const b = h.responseBuilder.speak(text);
    return (keepOpen ? b.reprompt(keepOpen) : b.withShouldEndSession(true)).getResponse();
  };

  /** Linked professional, or null (the caller answers with the LinkAccount card). */
  const pro = async (h: HandlerInput) => {
    const token = getAccountLinkingAccessToken(h.requestEnvelope);
    return token ? call(h, () => ports.professionalIdFromToken(token)) : null;
  };
  const linkAccount = (h: HandlerInput) =>
    h.responseBuilder
      .speak(SPEECH.linkAccount)
      .withLinkAccountCard()
      .withShouldEndSession(true)
      .getResponse();

  const isIntent = (h: HandlerInput, ...names: string[]) =>
    getRequestType(h.requestEnvelope) === 'IntentRequest' &&
    names.includes(getIntentName(h.requestEnvelope));

  const launch: RequestHandler = {
    canHandle: (h) => getRequestType(h.requestEnvelope) === 'LaunchRequest',
    async handle(h) {
      const pid = await pro(h);
      if (!pid) return linkAccount(h);
      const [d] = await call(h, () => ports.listDecisions(pid, 'pending', 1));
      if (!d) return say(h, SPEECH.welcome, SPEECH.help);
      h.attributesManager.setSessionAttributes({ decisionId: d.id });
      return say(h, `Você tem uma decisão. ${d.question}`, SPEECH.decisionPrompt);
    },
  };

  const agenda: RequestHandler = {
    canHandle: (h) => isIntent(h, ...Object.keys(AGENDA_INTENTS)),
    async handle(h) {
      const pid = await pro(h);
      if (!pid) return linkAccount(h);
      const text = AGENDA_INTENTS[getIntentName(h.requestEnvelope)]!;
      try {
        const r = await call(h, (signal) => ports.voiceCommand(pid, { text }, signal));
        return say(h, r.speech);
      } catch (e) {
        if (e instanceof BudgetExceeded) return say(h, SPEECH.slowAgenda);
        throw e;
      }
    },
  };

  const answer: RequestHandler = {
    canHandle: (h) =>
      isIntent(
        h,
        'ResponderDecisaoIntent',
        'ResponderSimIntent',
        'AMAZON.YesIntent',
        'AMAZON.NoIntent',
      ),
    async handle(h) {
      const pid = await pro(h);
      if (!pid) return linkAccount(h);
      const intent = getIntentName(h.requestEnvelope);
      const said =
        intent === 'AMAZON.YesIntent'
          ? 'sim'
          : intent === 'AMAZON.NoIntent'
            ? 'não'
            : intent === 'ResponderSimIntent'
              ? `sim, ${getSlotValue(h.requestEnvelope, 'complemento') ?? ''}`.replace(/,\s*$/, '')
              : (getSlotValue(h.requestEnvelope, 'resposta') ?? '').trim();
      if (!said) return say(h, SPEECH.notUnderstood, SPEECH.decisionPrompt);

      const sessionId = h.attributesManager.getSessionAttributes().decisionId as string | undefined;
      try {
        const pending = await call(h, () => ports.listDecisions(pid, 'pending', 20));
        const d = pending.find((x) => x.id === sessionId) ?? pending[0];
        if (!d) return say(h, SPEECH.noDecision);
        h.attributesManager.setSessionAttributes({ decisionId: d.id });
        const r = await call(h, () => ports.answerDecision(pid, d.id, answerBody(d, said)));
        return say(h, r.spokenConfirmation);
      } catch (e) {
        if (e instanceof BudgetExceeded) return say(h, SPEECH.slowAnswer);
        if (errCode(e) === 'ANSWER_NOT_UNDERSTOOD')
          return say(h, SPEECH.notUnderstood, SPEECH.decisionPrompt);
        if (errCode(e) === 'DECISION_CLOSED' || errCode(e) === 'NOT_FOUND')
          return say(h, SPEECH.closed);
        throw e;
      }
    },
  };

  const help: RequestHandler = {
    canHandle: (h) => isIntent(h, 'AMAZON.HelpIntent'),
    handle: (h) => say(h, SPEECH.help, SPEECH.help),
  };
  const stop: RequestHandler = {
    canHandle: (h) =>
      isIntent(h, 'AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NavigateHomeIntent'),
    handle: (h) => say(h, SPEECH.bye),
  };
  const fallback: RequestHandler = {
    canHandle: (h) => isIntent(h, 'AMAZON.FallbackIntent'),
    handle: (h) => say(h, `${SPEECH.fallback} ${SPEECH.help}`, SPEECH.help),
  };
  const sessionEnded: RequestHandler = {
    canHandle: (h) => getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
    handle: (h) => h.responseBuilder.getResponse(),
  };

  const errors: ErrorHandler = {
    canHandle: () => true,
    handle: (h, e) => say(h, e instanceof BudgetExceeded ? SPEECH.slowAgenda : SPEECH.error),
  };

  return SkillBuilders.custom()
    .withSkillId(opts.skillId)
    .addRequestHandlers(launch, agenda, answer, help, stop, fallback, sessionEnded)
    .addErrorHandlers(errors)
    .withCustomUserAgent('boramarca')
    .create();
}
