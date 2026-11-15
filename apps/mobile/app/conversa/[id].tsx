import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversations/ConversationScreen';

export default function ConversaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen id={id} />;
}
