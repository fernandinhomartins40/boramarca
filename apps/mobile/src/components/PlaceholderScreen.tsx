import { router } from 'expo-router';
import { Construction } from 'lucide-react-native';
import { EmptyState } from './EmptyState';
import { Header } from './Header';
import { Screen } from './Screen';

export interface PlaceholderScreenProps {
  title: string;
  /** Prompt that specifies this screen ("Prompt 03"). */
  spec?: string;
  /** Back arrow (inner screens). */
  back?: boolean;
  /** Tab screens leave the bottom inset to the tab bar. */
  tab?: boolean;
}

/** Temporary content of routes not built yet. Agents replace the whole route file. */
export function PlaceholderScreen({ title, spec, back, tab }: PlaceholderScreenProps) {
  return (
    <Screen edges={tab ? ['top', 'left', 'right'] : undefined}>
      <Header title={back ? title : undefined} onBack={back ? () => router.back() : undefined} />
      <EmptyState
        icon={Construction}
        title={title}
        message={spec ? `Em construção · ${spec}` : 'Em construção'}
      />
    </Screen>
  );
}
