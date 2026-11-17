import { z } from 'zod';
import { EntityBase, Id, IsoDateTime } from './common';
import { OtpCodeValue } from './auth';

/** `account_deletions`: the only record kept after an account is erased. */
export const AccountDeletionOrigin = z.enum(['app', 'web']);
export type AccountDeletionOrigin = z.infer<typeof AccountDeletionOrigin>;

export const AccountDeletion = EntityBase.extend({
  phoneHash: z.string(),
  requestedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
  origin: AccountDeletionOrigin,
});
export type AccountDeletion = z.infer<typeof AccountDeletion>;

/**
 * `DELETE /me` body. Needs a fresh code (`POST /auth/otp/request` with `purpose: "delete_account"`).
 * An owner with other professionals must send `transferOwnershipTo` or `deleteWholeSalon: true`;
 * otherwise the API answers 409 with code `OWNER_HAS_TEAM`. With Firebase phone login, send
 * `idToken` (a fresh Firebase sign-in of the account's phone) instead of `code`; one of the two.
 */
export const DeleteMeBody = z.object({
  code: OtpCodeValue.optional(),
  idToken: z.string().min(1).max(4096).optional(),
  origin: AccountDeletionOrigin,
  transferOwnershipTo: Id.optional(),
  deleteWholeSalon: z.boolean().optional(),
});
export type DeleteMeBody = z.infer<typeof DeleteMeBody>;

export const DeleteMeResponse = z.object({
  ok: z.literal(true),
  completedAt: IsoDateTime,
});
export type DeleteMeResponse = z.infer<typeof DeleteMeResponse>;

export const OWNER_HAS_TEAM_ERROR = 'OWNER_HAS_TEAM';
