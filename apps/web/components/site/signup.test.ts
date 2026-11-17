import { describe, expect, it } from 'vitest';
import { parseSignup } from './SignupFlow';

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const v = {
    name: 'Joana',
    salonName: 'Studio Joana',
    profession: 'manicure',
    phone: '(11) 91234-5678',
    email: ' Joana@Exemplo.com ',
    password: 'segredo123',
    ...over,
  };
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};

describe('parseSignup', () => {
  it('normalizes phone (E.164) and e-mail', () => {
    const r = parseSignup(form());
    expect(r).toEqual({
      ok: true,
      body: {
        name: 'Joana',
        salonName: 'Studio Joana',
        profession: 'manicure',
        phone: '+5511912345678',
        email: 'joana@exemplo.com',
        password: 'segredo123',
      },
    });
  });
  it('points at each wrong field', () => {
    const r = parseSignup(form({ phone: '1133334444', email: 'x', profession: '', name: '', password: 'curta' }));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual(['email', 'name', 'password', 'phone', 'profession']);
  });
});
