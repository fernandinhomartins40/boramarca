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
    try {
      if (!q.success) throw new Error('missing token');
      professionalId = app.verifyAccess(q.data.token).professionalId;
    } catch {
      socket.close(WS_UNAUTHORIZED, 'unauthorized');
      return;
    }
    const unsubscribe = app.bus.subscribe(professionalId, (event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    socket.on('close', unsubscribe);
  });
};

export default realtime;
