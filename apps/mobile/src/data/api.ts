import type { DataLayer } from './index';

/**
 * API implementation of every domain — STUB. Agent D1 replaces each entry with a real client
 * (src/lib/api) using `routes` from packages/shared. Until then every call rejects.
 */
function notImplemented<T extends object>(domain: string): T {
  return new Proxy({} as T, {
    get: (_target, method) => () =>
      Promise.reject(new Error(`api.${domain}.${String(method)}: não implementado`)),
  });
}

export const apiData: DataLayer = {
  auth: notImplemented('auth'),
  profile: notImplemented('profile'),
  whatsapp: notImplemented('whatsapp'),
  agenda: notImplemented('agenda'),
  clients: notImplemented('clients'),
  waitlist: notImplemented('waitlist'),
  decisions: notImplemented('decisions'),
  conversations: notImplemented('conversations'),
  voice: notImplemented('voice'),
  account: notImplemented('account'),
};
