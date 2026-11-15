import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { mockDecisions } from '@/data/decisions';
import { BalcaoScreen } from '../BalcaoScreen';
import { SilentTextToSpeech, setBalcaoEngines } from '../engines';
import { useBalcaoStore } from '../store';

// the machine is slow under the full suite: generous waits
jest.setTimeout(60_000);
const slow = { timeout: 15_000 };

const tts = new SilentTextToSpeech();
const chime = jest.fn(async () => undefined);
setBalcaoEngines({ textToSpeech: tts, chime });

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const renderBalcao = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <BalcaoScreen />
    </SafeAreaProvider>,
  );

async function openDevPanel() {
  const logo = screen.getAllByLabelText('Bora Marca')[0]!;
  for (let i = 0; i < 3; i++) await fireEvent.press(logo);
}

it('runs the proactive flow from the dev panel: aviso → pergunta → "sim" → confirmação', async () => {
  const { unmount } = await renderBalcao();
  expect(useBalcaoStore.getState().active).toBe(true);
  expect(screen.getByText('Ei, Bora Marca')).toBeTruthy();

  await openDevPanel();
  await fireEvent.press(await screen.findByText('Simular decisão', {}, slow));
  await waitFor(() => expect(useBalcaoStore.getState().snapshot.status).toBe('esperando_resposta'), slow);
  const decision = useBalcaoStore.getState().snapshot.decision!;
  expect(chime).toHaveBeenCalledTimes(1);
  expect(tts.spoken).toEqual([decision.question]);
  expect(screen.getByRole('button', { name: 'Sim' })).toBeTruthy();
  expect(screen.getByText('Você também pode responder falando.')).toBeTruthy();

  await openDevPanel();
  await fireEvent.press(await screen.findByText('Falar "sim"', {}, slow));
  await waitFor(() => expect(useBalcaoStore.getState().snapshot.status).toBe('parado'), slow);
  expect(tts.spoken[1]).toMatch(/^Pronto\./);
  const stored = mockDecisions.find((d) => d.id === decision.id)!;
  expect(stored).toMatchObject({ status: 'resolved', resolvedVia: 'voice', resolvedOption: 'sim' });

  await unmount();
  expect(useBalcaoStore.getState().active).toBe(false);
});

it('shows the low volume warning', async () => {
  await renderBalcao();
  await openDevPanel();
  await fireEvent.press(await screen.findByText('Volume baixo', {}, slow));
  expect(await screen.findByText('Volume baixo — aumente para ouvir os avisos', {}, slow)).toBeTruthy();
});
