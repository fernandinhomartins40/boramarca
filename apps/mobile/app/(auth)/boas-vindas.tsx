import { useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, CalendarDays } from 'lucide-react-native';
import { Button, Logo, Screen, StatusPill, Text, VoiceOrb } from '@/components';
import { useTheme } from '@/theme';

/** Boas-vindas (prompt 01, reference 01-boas-vindas): three swipeable cards + fixed buttons. */
export default function WelcomeScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const pageWidth = width - t.spacing.lg * 2;
  const orb = t.sizes.orb * 0.6;

  const cards: { title: string; text: string; art: ReactNode }[] = [
    {
      title: 'Sua agenda anda. Você atende.',
      text: 'O Bora Marca atende seu WhatsApp enquanto você trabalha.',
      art: (
        <View style={{ gap: t.spacing.sm, width: '100%' }}>
          {['09:00', '10:00', '11:00'].map((time) => (
            <View
              key={time}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                padding: t.spacing.md,
                borderRadius: t.radii.md,
                backgroundColor: t.colors.surface,
              }}
            >
              <CalendarDays color={t.colors.text} size={t.sizes.icon} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySmall" weight="semibold">
                  Hoje
                </Text>
                <Text variant="caption" color="textMuted">
                  {time}
                </Text>
              </View>
              <StatusPill status="confirmado" label="Agendado" />
            </View>
          ))}
        </View>
      ),
    },
    {
      title: 'Alguém desmarcou? A gente encaixa outro cliente.',
      text: 'E te pergunta antes, por voz.',
      art: <VoiceOrb state="falando" size={orb} />,
    },
    {
      title: 'Responda falando ou com um toque.',
      text: 'Sem parar o atendimento.',
      art: <VoiceOrb state="ouvindo" size={orb} />,
    },
  ];

  return (
    <Screen
      footer={
        <View style={{ flex: 1, gap: t.spacing.sm }}>
          <Button
            label="Criar conta grátis"
            size="lg"
            iconRight={ArrowRight}
            onPress={() => router.push('/criar-conta')}
          />
          <Button label="Já tenho conta" variant="neutral" onPress={() => router.push('/login')} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', paddingTop: t.spacing.md }}>
        <Logo height={t.sizes.logoHeader * 1.5} />
      </View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
        style={{ flex: 1 }}
      >
        {cards.map((c) => (
          <View key={c.title} style={{ width: pageWidth, gap: t.spacing.md }}>
            <Text variant="display">{c.title}</Text>
            <Text variant="heading" weight="regular" color="textMuted">
              {c.text}
            </Text>
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: t.spacing.lg,
                borderRadius: t.radii.lg,
                backgroundColor: t.colors.surfaceAlt,
              }}
            >
              {c.art}
            </View>
          </View>
        ))}
      </ScrollView>
      <View
        accessibilityLabel={`Card ${page + 1} de ${cards.length}`}
        style={{ flexDirection: 'row', justifyContent: 'center', gap: t.spacing.sm }}
      >
        {cards.map((c, i) => (
          <View
            key={c.title}
            style={{
              width: t.spacing.sm,
              height: t.spacing.sm,
              borderRadius: t.radii.pill,
              backgroundColor: i === page ? t.colors.primary : t.colors.border,
            }}
          />
        ))}
      </View>
    </Screen>
  );
}
