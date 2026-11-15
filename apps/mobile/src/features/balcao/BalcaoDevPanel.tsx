import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet, Button, TextField } from '@/components';
import { runSimulation } from '@/dev/simulations';
import { useTheme } from '@/theme';
import type { BalcaoController } from './controller';
import { setSimulatedVolume } from './engines';
import { LOW_VOLUME, useBalcaoStore } from './store';

/**
 * Hidden dev panel of Modo Balcão (3 taps on the logo, DEV_TOOLS_ENABLED only). Events go straight
 * to the controller, so it works with the simulated and with the native engines.
 */
export function BalcaoDevPanel({
  visible,
  onClose,
  controller,
}: {
  visible: boolean;
  onClose: () => void;
  controller: BalcaoController;
}) {
  const t = useTheme();
  const [phrase, setPhrase] = useState('');
  const low = useBalcaoStore((s) => s.volume !== null && s.volume < LOW_VOLUME);
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const row = { flexDirection: 'row' as const, gap: t.spacing.md };
  const half = { flex: 1 };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Balcão · desenvolvimento">
      <Button label="Simular palavra de ativação" onPress={act(controller.wake)} />
      <View style={row}>
        <Button
          label='Falar "sim"'
          variant="accent"
          style={half}
          onPress={act(() => controller.hear('sim'))}
        />
        <Button
          label='Falar "não"'
          variant="neutral"
          style={half}
          onPress={act(() => controller.hear('não'))}
        />
      </View>
      <TextField
        label="Simular frase"
        value={phrase}
        onChangeText={setPhrase}
        placeholder="quem é o próximo?"
      />
      <Button
        label="Falar a frase"
        variant="secondary"
        disabled={!phrase.trim()}
        onPress={act(() => controller.hear(phrase.trim()))}
      />
      <View style={row}>
        <Button
          label="Simular decisão"
          variant="secondary"
          style={half}
          onPress={act(() => void runSimulation('decision-new'))}
        />
        <Button
          label={low ? 'Volume normal' : 'Volume baixo'}
          variant="neutral"
          style={half}
          onPress={act(() => {
            const volume = low ? null : LOW_VOLUME / 3;
            setSimulatedVolume(volume);
            useBalcaoStore.setState({ volume });
          })}
        />
      </View>
    </BottomSheet>
  );
}
