import { useEffect, useState } from 'react';
import { showToast } from '@/components';
import { getBalcaoEngines } from '@/features/balcao/engines';

/**
 * Microphone button of "Responder outra coisa" and of the conversation input: dictates into a text
 * field. Uses the same `SpeechToText` engine as Modo Balcão, so the native recognizer plugged in
 * wave 4 (`setBalcaoEngines`) also serves here; the keyboard's own dictation keeps working too.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);

  useEffect(
    () => () => {
      void getBalcaoEngines().speechToText.stop();
    },
    [],
  );

  async function toggle() {
    const stt = getBalcaoEngines().speechToText;
    if (listening) {
      setListening(false);
      await stt.stop();
      return;
    }
    setListening(true);
    try {
      await stt.start({
        onPartial: () => undefined,
        onResult: (text) => {
          setListening(false);
          if (text.trim()) onText(text.trim());
        },
      });
    } catch {
      setListening(false);
      showToast('Não deu para usar o microfone agora.', 'danger');
    }
  }

  return { listening, toggle };
}
