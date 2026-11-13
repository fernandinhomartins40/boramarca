import { expect, it } from 'vitest';
import { PACKAGE_NAME, SEND_GUARD_DEFAULTS } from './index';

it('loads and sees shared contracts', () => {
  expect(PACKAGE_NAME).toBe('@boramarca/whatsapp');
  expect(SEND_GUARD_DEFAULTS.perMinute).toBe(8);
});
