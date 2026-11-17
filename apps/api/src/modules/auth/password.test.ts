import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hash', () => {
  it('verifies the right password only, with a fresh salt each time', async () => {
    const h = await hashPassword('segredo123');
    expect(await verifyPassword('segredo123', h)).toBe(true);
    expect(await verifyPassword('segredo124', h)).toBe(false);
    expect(await verifyPassword('segredo123', 'lixo')).toBe(false);
    expect(await hashPassword('segredo123')).not.toBe(h);
  });
});
