import { useLocalSearchParams } from 'expo-router';
import { ClientProfileScreen } from '@/features/clients/ClientProfileScreen';

export default function ClienteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientProfileScreen id={id} />;
}
