import { KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Header, Screen } from '@/components';
import { DeleteAccountFlow } from '@/features/account/DeleteAccountFlow';

/** Ajustes → Conta → Excluir conta. */
export default function DeleteAccountScreen() {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen edges={['top', 'left', 'right']} scroll>
        <Header title="Excluir conta" onBack={() => router.back()} />
        <DeleteAccountFlow />
      </Screen>
    </KeyboardAvoidingView>
  );
}
