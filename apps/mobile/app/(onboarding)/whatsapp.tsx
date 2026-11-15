import { router, useLocalSearchParams } from 'expo-router';
import { ConnectFlow } from '@/features/whatsapp/ConnectFlow';

/**
 * Conectar o WhatsApp (prompt 02). From the sign-up (`?onboarding=1`) it ends on the agenda and the
 * back arrow means "conectar depois"; from Ajustes or the red banner it goes back where it came.
 */
export default function WhatsAppScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const leave = () => (onboarding || !router.canGoBack() ? router.replace('/') : router.back());
  return <ConnectFlow onDone={leave} onBack={leave} />;
}
