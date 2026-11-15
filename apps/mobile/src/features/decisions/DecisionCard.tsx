import { useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import {
  CalendarClock,
  CalendarPlus,
  CalendarSync,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock,
  Hand,
  MessageCircle,
  Mic,
  Send,
  Timer,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import type { DecisionAnswerResponse, DecisionType, DecisionView } from '@boramarca/shared';
import { Avatar, Button, Card, IconButton, Text, TextField, showToast } from '@/components';
import { useDictation } from '@/features/conversations/useDictation';
import { useTheme } from '@/theme';
import { deadline, deadlineLabel, timeAgo, yesNoPair } from './format';
import { handleDecisionAction } from './index';

const TYPE_ICONS: Record<DecisionType, LucideIcon> = {
  encaixe: CalendarPlus,
  novo_horario: CalendarClock,
  remarcar: CalendarSync,
  atraso: Timer,
  duvida: CircleHelp,
};

export interface DecisionCardProps {
  decision: DecisionView;
  now: Date;
  highlighted?: boolean;
  onAnswered: (d: DecisionView, r: DecisionAnswerResponse) => void;
  /** "Deixa que eu respondo" (swipe or the button). */
  onTakeOver: (d: DecisionView) => void;
  onOpenConversation: (d: DecisionView) => void;
}

/** Pending decision (prompt 05, reference 06 left). Swipe left = "Deixa que eu respondo". */
export function DecisionCard({
  decision: d,
  now,
  highlighted,
  onAnswered,
  onTakeOver,
  onOpenConversation,
}: DecisionCardProps) {
  const t = useTheme();
  const [showContext, setShowContext] = useState(false);
  const [freeText, setFreeText] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const dictation = useDictation((said) => setText((v) => (v ? `${v} ${said}` : said)));
  const name = d.clientName ?? d.context.clientFirstName ?? 'Cliente';
  const Icon = TYPE_ICONS[d.type];
  const dl = deadline(d, now);
  const pair = yesNoPair(d.options);
  const reason = typeof d.context.extra?.reason === 'string' ? d.context.extra.reason : null;

  // swipe to the side → "Deixa que eu respondo" (the button below does the same, for accessibility)
  const [dx] = useState(() => new Animated.Value(0));
  const threshold = t.touchTarget.bigChoice;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > t.spacing.md && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_e, g) => dx.setValue(Math.min(0, g.dx)),
        onPanResponderRelease: (_e, g) => {
          Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start();
          if (g.dx < -threshold) onTakeOver(d);
        },
        onPanResponderTerminate: () =>
          Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [d, dx, onTakeOver, threshold, t.spacing.md],
  );

  async function answer(key: string, body: { optionId: string } | { text: string }) {
    setBusy(key);
    try {
      const r = await handleDecisionAction(d.id, body, 'app');
      onAnswered(d, r);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não deu para responder.', 'danger');
      setBusy(null);
    }
  }

  const option = (id: string) => () => void answer(id, { optionId: id });

  return (
    <View>
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          borderRadius: t.radii.lg,
          backgroundColor: t.colors.accent,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingHorizontal: t.spacing.lg,
        }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Hand color={t.colors.onAccent} size={t.sizes.icon} />
        <Text variant="caption" weight="semibold" color="onAccent">
          Deixa que eu respondo
        </Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: dx }] }} {...pan.panHandlers}>
        <Card
          style={{
            gap: t.spacing.md,
            borderWidth: highlighted ? t.sizes.borderStrong : t.sizes.border,
            borderColor: highlighted ? t.colors.primary : t.colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <Avatar name={name} size="sm" />
            <View style={{ flex: 1 }}>
              <Text weight="bold" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="bodySmall" color="textMuted">
                {timeAgo(d.createdAt, now)}
              </Text>
            </View>
            {d.conversationId ? (
              <IconButton
                icon={MessageCircle}
                accessibilityLabel={`Abrir a conversa com ${name}`}
                onPress={() => onOpenConversation(d)}
              />
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Icon color={t.colors.textMuted} size={t.sizes.icon} />
            <View style={{ flex: 1, gap: t.spacing.xs }}>
              <Text variant="heading" weight="bold">
                {d.question}
              </Text>
              {reason ? <Text color="textMuted">{reason}</Text> : null}
            </View>
          </View>

          {d.context.messages.length > 0 ? (
            <View style={{ borderRadius: t.radii.md, backgroundColor: t.colors.surfaceAlt }}>
              <Pressable
                onPress={() => setShowContext((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showContext ? 'Esconder conversa' : 'Ver conversa'}
                accessibilityState={{ expanded: showContext }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: t.touchTarget.min - t.spacing.sm,
                  paddingHorizontal: t.spacing.md,
                }}
              >
                <Text style={{ flex: 1 }}>Ver conversa</Text>
                {showContext ? (
                  <ChevronUp color={t.colors.text} size={t.sizes.iconSm} />
                ) : (
                  <ChevronDown color={t.colors.text} size={t.sizes.iconSm} />
                )}
              </Pressable>
              {showContext ? (
                <View
                  style={{
                    gap: t.spacing.sm,
                    paddingHorizontal: t.spacing.md,
                    paddingBottom: t.spacing.md,
                  }}
                >
                  {d.context.messages.slice(-3).map((m, i) => (
                    <Text key={i} variant="bodySmall">
                      <Text variant="bodySmall" weight="semibold">
                        {m.author === 'client' ? d.context.clientFirstName : 'IA'}:{' '}
                      </Text>
                      {m.text}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {pair ? (
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <Button
                label={pair.yes.label}
                icon={Check}
                onPress={option(pair.yes.id)}
                loading={busy === pair.yes.id}
                disabled={!!busy}
                style={{ flex: 3 }}
              />
              <Button
                label={pair.no.label}
                icon={X}
                variant="secondary"
                onPress={option(pair.no.id)}
                loading={busy === pair.no.id}
                disabled={!!busy}
                style={{ flex: 2 }}
              />
            </View>
          ) : (
            <View style={{ gap: t.spacing.sm }}>
              {d.options.map((o, i) => (
                <Button
                  key={o.id}
                  label={o.label}
                  variant={i === 0 ? 'primary' : 'secondary'}
                  onPress={option(o.id)}
                  loading={busy === o.id}
                  disabled={!!busy}
                />
              ))}
            </View>
          )}

          {freeText ? (
            <View style={{ gap: t.spacing.sm }}>
              <TextField
                value={text}
                onChangeText={setText}
                placeholder="Ex.: pode, mas marca daqui 15 minutos"
                accessibilityLabel="Sua resposta"
                multiline
                autoFocus
                right={
                  <IconButton
                    icon={Mic}
                    color={dictation.listening ? 'primaryText' : 'textMuted'}
                    accessibilityLabel={dictation.listening ? 'Parar de ditar' : 'Ditar resposta'}
                    onPress={() => void dictation.toggle()}
                  />
                }
              />
              {dictation.listening ? (
                <Text variant="caption" color="primaryText">
                  Ouvindo…
                </Text>
              ) : null}
              <Button
                label="Enviar resposta"
                icon={Send}
                onPress={() => void answer('text', { text: text.trim() })}
                disabled={!text.trim() || !!busy}
                loading={busy === 'text'}
              />
            </View>
          ) : (
            <Button
              label="Responder outra coisa"
              icon={Mic}
              variant="ghost"
              onPress={() => setFreeText(true)}
              style={{ backgroundColor: t.colors.surfaceAlt }}
            />
          )}

          <Button
            label="Deixa que eu respondo"
            icon={Hand}
            variant="ghost"
            size="md"
            onPress={() => onTakeOver(d)}
            disabled={!!busy}
            accessibilityLabel="Deixa que eu respondo: a IA para nesta conversa"
          />

          <View style={{ gap: t.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Clock
                color={dl.overdue ? t.colors.warning : t.colors.textMuted}
                size={t.sizes.iconSm}
              />
              <Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}>
                {deadlineLabel(dl)}
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Tempo para responder"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(dl.fraction * 100) }}
              style={{
                height: t.sizes.progress,
                borderRadius: t.radii.pill,
                backgroundColor: t.colors.surfaceAlt,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${dl.fraction * 100}%`,
                  height: '100%',
                  backgroundColor: dl.fraction < 0.25 ? t.colors.warning : t.colors.primary,
                }}
              />
            </View>
          </View>
        </Card>
      </Animated.View>
    </View>
  );
}
