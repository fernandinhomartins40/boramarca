import { showToast } from '@/components/Toast';
import { pushMockDecision } from '@/data/decisions';
import { registerSimulation, runSimulation } from '@/dev/simulations';
import { notifyDecision } from './decisionNotifications';

/** Dev menu: a new decision reaches the Decisões tab, the badge and a local notification. */
export async function simulateNewDecision() {
  const d = pushMockDecision();
  const notified = await notifyDecision(d).catch(() => false);
  showToast(
    notified
      ? 'Decisão nova: veja a notificação.'
      : 'Decisão nova criada (notificações desligadas).',
    'info',
  );
}

const EVERY_MS = 20_000;
let timer: ReturnType<typeof setInterval> | null = null;

registerSimulation({
  id: 'decision-new',
  label: 'Simular decisão nova',
  description: 'Cria um pedido de encaixe pendente e mostra a notificação com Sim e Não.',
  run: simulateNewDecision,
});

registerSimulation({
  id: 'decision-every-20s',
  label: 'Decisão nova a cada 20 s (liga/desliga)',
  description: 'Repete "Simular decisão nova" a cada 20 s até tocar de novo.',
  run: () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      showToast('Parei de criar decisões.', 'info');
      return;
    }
    // runSimulation also wakes the screens listening to `decision-new`
    timer = setInterval(() => void runSimulation('decision-new'), EVERY_MS);
    showToast('Uma decisão nova a cada 20 s.', 'info');
  },
});
