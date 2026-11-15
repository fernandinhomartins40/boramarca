import { showToast } from '@/components/Toast';
import { mockWhatsAppState } from '@/data/whatsapp';
import { registerSimulation } from '@/dev/simulations';

/**
 * The four situations of prompt 02 in the dev menu. "Erro" (`whatsapp-pairing-error`) and
 * "Desconexão depois" (`whatsapp-drop`) are the defaults from src/dev/simulations.ts; the
 * connect screen and the global banner listen to them.
 */
registerSimulation({
  id: 'whatsapp-pairing-success',
  label: 'Próximo pareamento conecta',
  description: 'Abra Ajustes → WhatsApp → Reconectar: conecta em ~9 s (sucesso).',
  run: () => {
    mockWhatsAppState.failNextPairing = false;
    showToast('O próximo pareamento vai conectar.', 'info');
  },
});

registerSimulation({
  id: 'whatsapp-code-expired',
  label: 'Próximo código de pareamento expira',
  description: 'O próximo código ou QR gerado vence em 5 s (código: "Gerar novo"; QR: renova).',
  run: () => {
    mockWhatsAppState.expireNextCode = true;
    showToast('O próximo código vai expirar logo.', 'info');
  },
});
