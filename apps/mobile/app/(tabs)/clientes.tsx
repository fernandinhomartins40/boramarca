import { useLocalSearchParams } from 'expo-router';
import { ClientsScreen } from '@/features/clients/ClientsScreen';

export default function ClientesScreen() {
  const { aba } = useLocalSearchParams<{ aba?: string }>();
  return <ClientsScreen key={aba} initialTab={aba === 'espera' ? 'espera' : 'clientes'} />;
}
