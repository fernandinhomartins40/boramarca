import type { Skill } from 'ask-sdk-core';
import type { RequestEnvelope } from 'ask-sdk-model';
import type { AlexaSkillResponse } from '@boramarca/shared';
import { AlexaVerificationError, type RequestVerifier } from './verify';

export interface AlexaHttpResult {
  status: 200 | 400;
  body: AlexaSkillResponse | { error: string };
}

/**
 * What `POST /v1/alexa/skill` calls: verify signature + timestamp, then run the skill.
 * Never throws; anything Amazon should not retry as a skill answer becomes 400.
 */
export function createAlexaRequestHandler(deps: {
  skill: Skill;
  verify: RequestVerifier;
  log?: (msg: string, err?: unknown) => void;
}) {
  return async function handle(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<AlexaHttpResult> {
    let envelope: RequestEnvelope;
    try {
      envelope = (await deps.verify(rawBody, headers)) as RequestEnvelope;
    } catch (err) {
      deps.log?.('alexa request rejected', err);
      return {
        status: 400,
        body: { error: err instanceof AlexaVerificationError ? err.message : 'invalid request' },
      };
    }
    try {
      return { status: 200, body: (await deps.skill.invoke(envelope)) as AlexaSkillResponse };
    } catch (err) {
      // Only reached on SDK-level failures, e.g. a request for another skill id.
      deps.log?.('alexa skill failed', err);
      return { status: 400, body: { error: 'invalid request' } };
    }
  };
}
