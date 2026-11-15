import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import {
  CalendarDays,
  CircleCheck,
  MessageCircle,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { usePendingDecisionsCount } from '@/features/decisions';
import { useTheme } from '@/theme';

/** Bottom tabs as in reference 04-agenda: active tab on violeta claro, Decisões with a counter. */
export default function TabsLayout() {
  const t = useTheme();
  const pending = usePendingDecisionsCount();
  const icon =
    (Icon: LucideIcon) =>
    ({ color }: { color: ColorValue }) => <Icon color={color} size={t.sizes.icon} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.colors.bg },
        tabBarActiveTintColor: t.colors.tabActive,
        tabBarInactiveTintColor: t.colors.text,
        tabBarActiveBackgroundColor: t.colors.surfaceAlt,
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
          minHeight: t.touchTarget.min + t.spacing.lg,
          paddingTop: t.spacing.xs,
        },
        tabBarItemStyle: {
          minHeight: t.touchTarget.min,
          marginHorizontal: t.spacing.xs / 2,
          paddingHorizontal: 0,
          borderRadius: t.radii.md,
          overflow: 'hidden',
        },
        tabBarLabelStyle: { fontFamily: t.fontFamily.medium, fontSize: t.text.caption.fontSize },
        tabBarBadgeStyle: {
          backgroundColor: t.colors.accent,
          color: t.colors.onAccent,
          fontFamily: t.fontFamily.bold,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Agenda', tabBarIcon: icon(CalendarDays) }} />
      <Tabs.Screen
        name="decisoes"
        options={{
          title: 'Decisões',
          tabBarIcon: icon(CircleCheck),
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarAccessibilityLabel: pending > 0 ? `Decisões, ${pending} pendentes` : 'Decisões',
        }}
      />
      <Tabs.Screen
        name="conversas"
        options={{ title: 'Conversas', tabBarIcon: icon(MessageCircle) }}
      />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: icon(Users) }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icon(Settings) }} />
    </Tabs>
  );
}
