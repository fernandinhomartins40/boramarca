import { useState } from 'react';
import { router } from 'expo-router';
import { FlaskConical, LayoutGrid, Mic, Play } from 'lucide-react-native';
import { Header, ListItem, Screen, SegmentedControl, Text, showToast } from '@/components';
import { dataSource } from '@/data';
import { listSimulations, runSimulation } from '@/dev/simulations';
import { useThemePreference, type ThemePreference } from '@/theme';

/** Menu de desenvolvimento: vitrine, simulations (src/dev/simulations.ts) and theme override. */
export default function DevMenu() {
  const { preference, setPreference } = useThemePreference();
  const [running, setRunning] = useState<string | null>(null);

  async function run(id: string) {
    setRunning(id);
    try {
      await runSimulation(id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Falhou', 'danger');
    } finally {
      setRunning(null);
    }
  }

  return (
    <Screen scroll>
      <Header title="Desenvolvimento" onBack={() => router.back()} />
      <Text color="textMuted">Fonte de dados: {dataSource}</Text>
      <ListItem
        icon={LayoutGrid}
        title="Vitrine de componentes"
        subtitle="Todos os componentes, estados, claro e escuro"
        onPress={() => router.push('/dev/vitrine')}
      />
      <Text variant="heading">Aparência</Text>
      <SegmentedControl<ThemePreference>
        segments={[
          { value: 'system', label: 'Sistema' },
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Escuro' },
        ]}
        value={preference}
        onChange={setPreference}
      />
      <Text variant="caption" color="textMuted">
        {preference === 'system'
          ? 'Segue o sistema'
          : preference === 'dark'
            ? 'Escuro fixo'
            : 'Claro fixo'}
      </Text>
      <Text variant="heading">Simulações</Text>
      {listSimulations().map((s) => (
        <ListItem
          key={s.id}
          icon={running === s.id ? FlaskConical : Play}
          title={s.label}
          subtitle={s.description}
          chevron={false}
          onPress={() => run(s.id)}
        />
      ))}
      <ListItem icon={Mic} title="Abrir o Modo Balcão" onPress={() => router.push('/balcao')} />
    </Screen>
  );
}
