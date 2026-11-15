import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Pencil, Trash } from 'lucide-react-native';
import type { SuggestedService } from '@boramarca/shared';
import { Button, Card, IconButton, Text, TextField } from '@/components';
import { useTheme } from '@/theme';
import { formatDuration, formatPrice, parsePrice } from './format';

/** Service as shown in a list: "Sessão de fisioterapia · 50 min · R$ 150" + pencil. */
export function ServiceRow({
  service,
  onEdit,
  right,
}: {
  service: SuggestedService;
  onEdit?: () => void;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      <View style={{ flex: 1 }}>
        <Text weight="semibold">{service.name}</Text>
        <Text variant="bodySmall" color="textMuted">
          {formatDuration(service.durationMin)} · {formatPrice(service.priceCents, true)}
        </Text>
      </View>
      {right}
      {onEdit ? (
        <IconButton icon={Pencil} accessibilityLabel={`Editar ${service.name}`} onPress={onEdit} />
      ) : null}
    </Card>
  );
}

/** Name, duration and price, with inline validation. */
export function ServiceForm({
  initial,
  onSave,
  onCancel,
  onRemove,
  saving,
}: {
  initial?: SuggestedService;
  onSave: (s: SuggestedService) => void;
  onCancel: () => void;
  onRemove?: () => void;
  saving?: boolean;
}) {
  const t = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [duration, setDuration] = useState(initial ? String(initial.durationMin) : '');
  const [price, setPrice] = useState(
    initial ? formatPrice(initial.priceCents).replace('R$ ', '') : '',
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    const durationMin = Number(duration);
    const priceCents = parsePrice(price);
    if (!name.trim()) return setError('Dê um nome ao serviço.');
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 720)
      return setError('A duração vai de 5 a 720 minutos.');
    if (priceCents === null) return setError('Confira o preço, como 150 ou 150,00.');
    onSave({ name: name.trim(), durationMin, priceCents });
  }

  return (
    <Card variant="alt" style={{ gap: t.spacing.md }}>
      <TextField label="Nome do serviço" value={name} onChangeText={setName} maxLength={80} />
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Duração (min)"
            value={duration}
            onChangeText={(v) => setDuration(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Preço (R$)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      {error ? (
        <Text variant="bodySmall" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        {onRemove ? (
          <IconButton
            icon={Trash}
            color="danger"
            accessibilityLabel="Remover serviço"
            onPress={onRemove}
          />
        ) : null}
        <Button label="Cancelar" variant="neutral" onPress={onCancel} style={{ flex: 1 }} />
        <Button label="Salvar" onPress={save} loading={saving} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
