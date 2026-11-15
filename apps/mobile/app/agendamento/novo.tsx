import { useLocalSearchParams } from 'expo-router';
import { NewAppointmentScreen } from '@/features/agenda/NewAppointmentScreen';

export default function NovoAgendamentoScreen() {
  const params = useLocalSearchParams<{ startsAt?: string; date?: string; clientId?: string }>();
  return <NewAppointmentScreen {...params} />;
}
