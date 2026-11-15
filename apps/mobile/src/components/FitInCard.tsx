import { View } from 'react-native';
import { CalendarPlus } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { BigChoice } from './BigChoice';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

export interface FitInCardProps {
  /** "1 pedido de encaixe". */
  title: string;
  /** "Beatriz pode vir às 16h?". */
  question: string;
  onYes: () => void;
  onNo: () => void;
  onDetails?: () => void;
  loading?: 'yes' | 'no' | null;
}

/** Pending fit-in request on the Agenda: lima claro card with Sim / Não right there. */
export function FitInCard({ title, question, onYes, onNo, onDetails, loading }: FitInCardProps) {
  const t = useTheme();
  return (
    <Card variant="accentSoft" style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <CalendarPlus color={t.colors.text} size={t.sizes.iconLg - t.spacing.xs} />
        <View style={{ flex: 1 }}>
          <Text variant="heading" weight="bold">
            {title}
          </Text>
          <Text>{question}</Text>
        </View>
      </View>
      <BigChoice size="compact" onYes={onYes} onNo={onNo} loading={loading} />
      {onDetails ? <Button label="Ver detalhes" variant="ghost" onPress={onDetails} /> : null}
    </Card>
  );
}
