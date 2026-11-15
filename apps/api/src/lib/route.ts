import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RouteContract } from '@boramarca/shared';
import type { z } from 'zod';

type Part<C, K extends string> =
  C extends Record<K, infer S extends z.ZodType> ? z.output<S> : undefined;

export type RouteRequest<C extends RouteContract> = Omit<
  FastifyRequest,
  'params' | 'query' | 'body'
> & {
  params: Part<C, 'params'>;
  query: Part<C, 'query'>;
  body: Part<C, 'body'>;
};

/**
 * Registers a handler for a contract of `routes` (@boramarca/shared): method, path, schemas
 * (validation, serialization, OpenAPI) and auth all come from the contract.
 */
export function route<C extends RouteContract>(
  app: FastifyInstance,
  c: C,
  handler: (req: RouteRequest<C>, reply: FastifyReply) => Promise<z.output<C['response']>>,
) {
  app.route({
    method: c.method,
    url: c.path,
    schema: {
      ...(c.params && { params: c.params }),
      ...(c.query && { querystring: c.query }),
      ...(c.body && { body: c.body }),
      response: { 200: c.response },
      ...(c.auth !== 'public' && { security: [{ bearerAuth: [] }] }),
    },
    ...(c.auth !== 'public' && {
      onRequest: c.auth === 'owner' ? app.requireOwner : app.authenticate,
    }),
    handler: handler as (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
  });
}
