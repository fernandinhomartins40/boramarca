import { expect, it } from 'vitest';
import { AI_TOOL_NAMES } from '@boramarca/shared';
import { PACKAGE_NAME, toolNames } from './index';
import { CASES } from '../evals/cases';

it('loads and sees the AI tools', () => {
  expect(PACKAGE_NAME).toBe('@boramarca/ia');
  expect(toolNames).toContain('perguntar_ao_profissional');
});

it('eval set: 40+ pt-BR cases, beauty and health, every required category, valid tool names', () => {
  expect(CASES.length).toBeGreaterThanOrEqual(40);
  expect(new Set(CASES.map((c) => c.area))).toEqual(new Set(['beleza', 'saude']));
  const categories = new Set(CASES.map((c) => c.category));
  for (const c of [
    'cancelamento',
    'pedido_horario',
    'remarcacao',
    'atraso',
    'preco',
    'audio',
    'ambigua',
    'giria',
    'sintoma',
  ] as const)
    expect(categories).toContain(c);
  for (const c of CASES) for (const t of c.expect) expect(AI_TOOL_NAMES).toContain(t);
  expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
});
