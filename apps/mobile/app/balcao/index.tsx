import { router } from 'expo-router';
import { EmptyState, Header, Screen, Text, VoiceOrb } from '@/components';
import { ThemeScope } from '@/theme';

// Empty route created by A4; agent C3 replaces it with the Modo Balcão (prompt 07). Always dark.
export default function BalcaoScreen() {
  return (
    <ThemeScope scheme="dark">
      <Screen>
        <Header title="Modo Balcão" onBack={() => router.back()} />
        <EmptyState
          art={
            <VoiceOrb state="parado">
              <Text variant="title" color="onPrimary" align="center">
                Diga{'\n'}
                <Text variant="title" color="accent">
                  Ei, Bora Marca
                </Text>
              </Text>
            </VoiceOrb>
          }
          title="Modo Balcão"
          message="Em construção · Prompt 07"
        />
      </Screen>
    </ThemeScope>
  );
}
