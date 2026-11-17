import type { FastifyPluginAsync } from 'fastify';
import { RealtimeQuery } from '@boramarca/shared';

/** Close code sent when the token is missing or invalid (the app then refreshes and reconnects). */
export const WS_UNAUTHORIZED = 4401;

/**
 * `WS /v1/realtime?token=<accessToken>`: pushes the events of `RealtimeEvent` for the
 * authenticated professional only. Server -> client; client messages are ignored.
 */
const realtime: FastifyPluginAsync = async (app) => {
  app.get('/realtime', { websocket: true, schema: { hide: true } }, (socket, req) => {
    const q = RealtimeQuery.safeParse(req.query);
    let professionalId: string;
    let exp: number;
    try {
      if (!q.success) throw new Error('missing token');
      ({ professionalId, exp } = app.verifyAccess(q.data.token));
    } catch {
      socket.close(WS_UNAUTHORIZED, 'unauthorized');
      return;
    }
    const unsubscribe = app.bus.subscribe(professionalId, (event) => {
      // published by eraseProfessional on any instance (Redis bus): stop right away (B8)
      if (event.type === 'account.deleted') socket.close(WS_UNAUTHORIZED, 'account deleted');
      else if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    // The session also ends with its token: the app reconnects with a fresh one.
    const expiry = setTimeout(
      () => socket.close(WS_UNAUTHORIZED, 'token expired'),
      Math.min(2 ** 31 - 1, Math.max(0, exp - Date.now())),
    );
    socket.on('close', () => {
      clearTimeout(expiry);
      unsubscribe();
    });
  });
};

export default realtime;
