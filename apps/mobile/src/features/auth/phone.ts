import type { PhoneE164 } from '@boramarca/shared';

const digits = (s: string) => s.replace(/\D/g, '');

/** Brazilian mask while typing: "(11) 91234-5678" (mobile) or "(11) 3123-4567" (landline). */
export function maskBrPhone(input: string): string {
  const d = digits(input).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const split = rest.length > 8 ? 5 : 4;
  return rest.length <= split
    ? `(${ddd}) ${rest}`
    : `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** "(11) 98765-4321" → "+5511987654321"; null while the number is incomplete. */
export function toE164(masked: string): PhoneE164 | null {
  const d = digits(masked);
  return d.length === 10 || d.length === 11 ? `+55${d}` : null;
}

/** "+5511987654321" → "+55 (11) 98765-4321"; other countries as they are. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  return e164.startsWith('+55') ? `+55 ${maskBrPhone(e164.slice(3))}` : e164;
}

/** Local part only, for the login field: "+5511987654321" → "(11) 98765-4321". */
export const localPhone = (e164: string | null | undefined) =>
  e164?.startsWith('+55') ? maskBrPhone(e164.slice(3)) : '';
