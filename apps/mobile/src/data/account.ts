import type { DeleteMeBody, DeleteMeResponse } from '@boramarca/shared';
import { DEMO_OTP } from './mock/fixtures';
import { fail, nowIso, reply } from './mock/util';

/**
 * Account deletion (Ajustes → Conta). The code comes from `auth.requestOtp({ purpose:
 * 'delete_account' })`. Owner: agent B2; api implementation: D1 (`DELETE /me`).
 */
export interface AccountData {
  deleteMe(body: DeleteMeBody): Promise<DeleteMeResponse>;
}

export const mockAccount: AccountData = {
  async deleteMe(body) {
    if (body.code !== DEMO_OTP)
      fail(400, 'INVALID_CODE', 'Código errado. Confira o SMS e tente de novo.');
    return reply({ ok: true as const, completedAt: nowIso() });
  },
};
