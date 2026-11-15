import { mockData } from '@/data';
import { mockWhatsAppState } from '@/data/whatsapp';
import {
  listSimulations,
  onSimulation,
  registerSimulation,
  runSimulation,
} from '@/dev/simulations';

it('has the three dev simulations of the plan', () => {
  const ids = listSimulations().map((s) => s.id);
  expect(ids).toEqual(expect.arrayContaining(['decision-new', 'whatsapp-drop', 'wake-word']));
});

it('decision-new adds a pending decision and notifies listeners', async () => {
  const before = (await mockData.decisions.list('pending')).items.length;
  const listener = jest.fn();
  const off = onSimulation('decision-new', listener);
  await runSimulation('decision-new');
  off();
  expect((await mockData.decisions.list('pending')).items.length).toBe(before + 1);
  expect(listener).toHaveBeenCalledTimes(1);
});

it('whatsapp-drop disconnects the mock WhatsApp', async () => {
  await runSimulation('whatsapp-drop');
  expect(mockWhatsAppState.status).toBe('disconnected');
  expect((await mockData.whatsapp.getStatus()).status).toBe('disconnected');
});

it('agents can replace a simulation by id', async () => {
  const run = jest.fn();
  registerSimulation({ id: 'wake-word', label: 'Simular palavra de ativação', run });
  await runSimulation('wake-word');
  expect(run).toHaveBeenCalled();
});
