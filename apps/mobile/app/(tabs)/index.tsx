import { router } from 'expo-router';
import { Bell, CircleUser, Construction } from 'lucide-react-native';
import { BalcaoStatus, EmptyState, Header, IconButton, Screen, Text } from '@/components';

// Empty route created by A4; agent B3 replaces it with the Agenda do dia (prompt 03).
export default function AgendaScreen() {
  return (
    <Screen edges={['top', 'left', 'right']}>
      <Header
        right={
          <>
            <IconButton icon={Bell} accessibilityLabel="Notificações" />
            <IconButton icon={CircleUser} accessibilityLabel="Perfil" />
          </>
        }
      />
      <Text variant="title">Agenda</Text>
      <BalcaoStatus active={false} onPress={() => router.push('/balcao')} />
      <EmptyState icon={Construction} title="Agenda do dia" message="Em construção · Prompt 03" />
    </Screen>
  );
}
