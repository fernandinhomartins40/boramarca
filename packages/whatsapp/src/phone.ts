/** `+5511912345678` -> `5511912345678` (Evolution wants digits only). */
export const toProviderNumber = (phoneE164: string): string => phoneE164.replace(/\D/g, '');

/**
 * `5511912345678@s.whatsapp.net` -> `+5511912345678`. Returns null for groups, LIDs, broadcasts.
 * Brazilian mobiles registered before the 9th digit still arrive with 8 digits
 * (`551181234567`); they are normalized to the 9-digit form so the client matches the phone
 * the professional typed.
 */
export function jidToE164(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const m = /^(\d{8,15})(?::\d+)?@s\.whatsapp\.net$/.exec(jid);
  if (!m?.[1]) return null;
  let digits = m[1];
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) digits = `${digits.slice(0, 4)}9${digits.slice(4)}`;
  return `+${digits}`;
}
