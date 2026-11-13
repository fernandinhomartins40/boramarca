import { expect, it } from 'vitest';
import { ALEXA_RESPONSE_BUDGET_MS, PACKAGE_NAME } from './index';

it('loads', () => {
  expect(PACKAGE_NAME).toBe('@boramarca/alexa');
  expect(ALEXA_RESPONSE_BUDGET_MS).toBe(8000);
});
