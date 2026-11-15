import { useLocalSearchParams } from 'expo-router';
import { DecisionsScreen } from '@/features/decisions/DecisionsScreen';

// `decisionId` comes from a tapped notification (src/features/notifications).
export default function DecisoesScreen() {
  const { decisionId } = useLocalSearchParams<{ decisionId?: string }>();
  return <DecisionsScreen decisionId={decisionId} />;
}
