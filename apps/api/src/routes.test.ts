// Every HTTP route of the contract (@boramarca/shared routes, plan section 9) has a handler.
// Alexa (POST /alexa/skill) belongs to wave 4 and is the only exception.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { API_PREFIX, listRoutes, routes } from '@boramarca/shared';
import { testApp } from './test/helpers';

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp();
  await app.ready();
});
afterAll(() => app.close());

it('registers every contract route except the Alexa skill', () => {
  const pending = new Set<unknown>([routes.alexa.skill]);
  const missing = listRoutes()
    .filter((r) => !pending.has(r))
    .filter((r) => !app.hasRoute({ method: r.method, url: `${API_PREFIX}${r.path}` }))
    .map((r) => `${r.method} ${r.path}`);
  expect(missing).toEqual([]);
});
