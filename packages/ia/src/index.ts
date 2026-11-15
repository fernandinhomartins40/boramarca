// packages/ia: understands messages and writes texts. Never touches the database:
// the output is always a validated tool call that the API runs (plan section 15).
import { AI_TOOL_NAMES } from '@boramarca/shared';

export const PACKAGE_NAME = '@boramarca/ia';
export const toolNames = AI_TOOL_NAMES;

export * from './llm';
export * from './fake-llm';
export { SYSTEM_PROMPT, TONE_GUIDE } from './prompts';
export {
  buildContext,
  maskPii,
  firstName,
  type AiContext,
  type ClientMessageInput,
} from './context';
export {
  AI_TOOLS,
  interpretClientMessage,
  askProfessionalFallback,
  hasClinicalInfo,
  parseTurn,
} from './interpret-client';
export {
  interpretProfessionalAnswer,
  parseProfessionalAnswer,
  type DecisionForAnswer,
  type ProfessionalAnswerOptions,
} from './professional-answer';
export { interpretVoiceCommand, type VoiceDaySummary, type VoiceAnswer } from './voice';
export { renderMessage, type MessageKind, type MessageParams } from './texts';
export * from './transcriber';
export { formatWhen, spokenTimeOf, zonedParts, zonedToUtc } from './time';
