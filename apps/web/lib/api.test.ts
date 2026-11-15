import { describe, expect, it, vi } from 'vitest';
import { routes } from '@boramarca/shared';
import { ApiCallError, callApi, toE164 } from './api';
import { parseLead } from '../components/site/ContactForm';

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('toE164', () => {
  it('adds +55 to Brazilian numbers with area code', () => {
    expect(toE164('(11) 98765-4321')).toBe('+5511987654321');
    expect(toE164('11 3333-4444')).toBe('+551133334444');
  });
  it('keeps an explicit country code', () => {
    expect(toE164('+55 11 98765-4321')).toBe('+5511987654321');
    expect(toE164('5511987654321')).toBe('+5511987654321');
  });
});

describe('parseLead', () => {
  it('builds the POST /leads body', () => {
    const r = parseLead(
      form({
        name: ' Ana ',
        phone: '(11) 98765-4321',
        profession: 'psicologo',
        message: '',
        website: '',
      }),
    );
    expect(r).toEqual({
      ok: true,
      body: {
        name: 'Ana',
        phone: '+5511987654321',
        profession: 'psicologo',
        message: null,
        source: 'site_contato',
        website: '',
      },
    });
  });
  it('returns friendly per-field errors', () => {
    const r = parseLead(form({ name: '', phone: '123' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBe('Informe seu nome.');
      expect(r.errors.phone).toMatch(/DDD/);
    }
  });
  it('rejects a filled honeypot', () => {
    const r = parseLead(form({ name: 'Bot', phone: '11987654321', website: 'http://spam' }));
    expect(r.ok).toBe(false);
  });
});

describe('callApi', () => {
  it('posts JSON with the bearer token to /v1 + path', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, completedAt: '2026-11-14T00:00:00.000Z' }),
    );
    await callApi(
      routes.auth.deleteMe,
      { body: { code: '123456', origin: 'web' }, token: 'tok' },
      fetchMock,
    );
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3333/v1/me', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tok' },
      body: JSON.stringify({ code: '123456', origin: 'web' }),
    });
  });
  it('turns an ApiError body into ApiCallError with its code', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { statusCode: 409, code: 'OWNER_HAS_TEAM', message: 'Transfira o espaço' },
        { status: 409 },
      ),
    );
    await expect(
      callApi(routes.auth.deleteMe, { body: { code: '123456', origin: 'web' } }, fetchMock),
    ).rejects.toMatchObject({ status: 409, code: 'OWNER_HAS_TEAM', message: 'Transfira o espaço' });
  });
  it('reports network failures in pt-BR', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await callApi(
      routes.site.createLead,
      { body: { name: 'a', phone: '+5511987654321' } },
      fetchMock,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ApiCallError);
    expect(err.code).toBe('NETWORK');
  });
});
