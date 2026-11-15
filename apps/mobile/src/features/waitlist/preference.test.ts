import { preferenceLabel } from './preference';

it('turns the preference into a short phrase', () => {
  expect(preferenceLabel({ weekdays: [], periods: ['tarde'] })).toBe('Qualquer dia à tarde');
  expect(preferenceLabel({ weekdays: [6], periods: [] })).toBe('Só sábado');
  expect(preferenceLabel({ weekdays: [4, 2], periods: ['manha'] })).toBe('Terça e quinta de manhã');
  expect(preferenceLabel({ weekdays: [], periods: [], note: 'Após 17h' })).toBe('Após 17h');
});
