import { expect, it } from 'vitest';
import { PACKAGE_NAME, toolNames } from './index';

it('loads and sees the AI tools', () => {
  expect(PACKAGE_NAME).toBe('@boramarca/ia');
  expect(toolNames).toContain('perguntar_ao_profissional');
});
