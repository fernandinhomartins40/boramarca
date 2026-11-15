import { useLocalSearchParams } from 'expo-router';
import { AppointmentDetailScreen } from '@/features/agenda/AppointmentDetailScreen';

export default function AgendamentoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AppointmentDetailScreen id={id} />;
}
