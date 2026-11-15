import { router } from 'expo-router';
import { Construction, Wrench } from 'lucide-react-native';
import { EmptyState, Header, ListItem, Screen, Text } from '@/components';
import { DEV_TOOLS_ENABLED } from '@/dev/flags';

// Empty route created by A4; agent B2 replaces it with Ajustes (prompt 10).
// Keep the dev-menu entry below (only rendered when DEV_TOOLS_ENABLED).
export default function AjustesScreen() {
  return (
    <Screen edges={['top', 'left', 'right']} scroll>
      <Header />
      <Text variant="title">Ajustes</Text>
      <EmptyState icon={Construction} title="Ajustes" message="Em construção · Prompt 10" />
      {DEV_TOOLS_ENABLED ? (
        <ListItem
          icon={Wrench}
          title="Menu de desenvolvimento"
          subtitle="Vitrine e simulações (só em desenvolvimento)"
          onPress={() => router.push('/dev')}
        />
      ) : null}
    </Screen>
  );
}
