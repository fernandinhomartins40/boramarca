import { showToast } from '@/components/Toast';
import { pushMockDecision } from '@/data/decisions';
import { mockControl } from '@/data/mock/util';
import { mockWhatsAppState } from '@/data/whatsapp';

/**
 * Registry of dev simulations shown in app/dev (menu de desenvolvimento). Dev-only: nothing here is
 * reachable in production builds (see app/dev/_layout.tsx).
 *
 * To extend: call `registerSimulation({...})` from your feature (same `id` replaces the default),
 * and react to it with `onSimulation(id, handler)` — e.g. the Balcão screen listens to `wake-word`.
 */
export interface Simulation {
  id: string;
  label: string;
  description?: string;
  /** Default behavior; listeners registered with `onSimulation` also run. */
  run?: () => void | Promise<void>;
}

const registry = new Map<string, Simulation>();
const listeners = new Map<string, Set<() => void>>();

export function registerSimulation(sim: Simulation) {
  registry.set(sim.id, sim);
}

export function listSimulations(): Simulation[] {
  return [...registry.values()];
}

/** Subscribes to a simulation; returns the unsubscribe function (use it in an effect cleanup). */
export function onSimulation(id: string, handler: () => void): () => void {
  const set = listeners.get(id) ?? new Set();
  set.add(handler);
  listeners.set(id, set);
  return () => set.delete(handler);
}

export async function runSimulation(id: string) {
  const sim = registry.get(id);
  if (!sim) throw new Error(`Simulação desconhecida: ${id}`);
  await sim.run?.();
  listeners.get(id)?.forEach((h) => h());
}

// ---- defaults (agents B2, C2 and C3 replace or listen to these)

registerSimulation({
  id: 'decision-new',
  label: 'Simular decisão nova',
  description: 'Cria um pedido de encaixe pendente (Decisões, notificação, Balcão).',
  run: () => {
    pushMockDecision();
    showToast('Decisão nova criada.', 'info');
  },
});

registerSimulation({
  id: 'whatsapp-drop',
  label: 'Simular queda do WhatsApp',
  description: 'Muda o status para desconectado (banner global vermelho).',
  run: () => {
    mockWhatsAppState.status = 'disconnected';
    showToast('WhatsApp desconectado.', 'danger');
  },
});

registerSimulation({
  id: 'whatsapp-pairing-error',
  label: 'Próximo pareamento falha',
  description: 'O próximo pareamento do WhatsApp termina em erro.',
  run: () => {
    mockWhatsAppState.failNextPairing = true;
    showToast('O próximo pareamento vai falhar.', 'info');
  },
});

registerSimulation({
  id: 'wake-word',
  label: 'Simular palavra de ativação',
  description: '"Ei, Bora Marca" — o Modo Balcão começa a ouvir.',
  run: () => showToast('Palavra de ativação simulada.', 'info'),
});

registerSimulation({
  id: 'next-call-fails',
  label: 'Próxima chamada de dados falha',
  description: 'Mostra o estado de erro da próxima tela que carregar (só mock).',
  run: () => {
    mockControl.failNext = true;
  },
});
