import type { DeleteMeBody, DeleteMeResponse, KitLeadCreate, KitLead } from '@boramarca/shared';
import { DEMO_OTP, ids } from './mock/fixtures';
import { base, fail, newId, nowIso, reply } from './mock/util';

/**
 * Account (Ajustes → Conta): deletion and the Kit Balcão interest. The deletion code comes from
 * `auth.requestOtp({ purpose: 'delete_account' })`. Owner: agent B2; api implementation: D1
 * (`DELETE /me`, `POST /kit-leads`).
 */
export interface AccountData {
  deleteMe(body: DeleteMeBody): Promise<DeleteMeResponse>;
  createKitLead(body: KitLeadCreate): Promise<KitLead>;
}

export const mockAccount: AccountData = {
  async deleteMe(body) {
    if (body.code !== DEMO_OTP)
      fail(400, 'INVALID_CODE', 'Código errado. Confira o SMS e tente de novo.');
    return reply({ ok: true as const, completedAt: nowIso() });
  },
  async createKitLead(body) {
    return reply({ ...base(newId(), 0), professionalId: ids.professional, note: body.note });
  },
};
