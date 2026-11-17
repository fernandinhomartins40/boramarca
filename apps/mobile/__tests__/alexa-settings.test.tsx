import { fireEvent, render, screen } from '@testing-library/react-native';
import { data } from '@/data';
import AlexaSettingsScreen from '../app/(tabs)/ajustes/alexa';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const LINKED = {
  linked: true,
  voiceMonkeyEnabled: false,
  voiceMonkeyDevice: null,
  voiceMonkeyTokenSet: false,
};

afterEach(() => jest.restoreAllMocks());

it('shows the link and saves the announcement options', async () => {
  jest.spyOn(data.alexa, 'getSettings').mockResolvedValue(LINKED);
  const update = jest
    .spyOn(data.alexa, 'updateSettings')
    .mockImplementation(async ({ voiceMonkeyToken, ...patch }) => ({
      ...LINKED,
      ...patch,
      voiceMonkeyTokenSet: !!voiceMonkeyToken,
    }));
  await render(<AlexaSettingsScreen />);

  expect(await screen.findByText('Conta vinculada')).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch', { name: 'Avisar pela Alexa' }));
  expect(update).toHaveBeenCalledWith({ voiceMonkeyEnabled: true });

  await fireEvent.changeText(screen.getByLabelText('Nome do aparelho no Voice Monkey'), 'echo-balcao');
  await fireEvent.changeText(screen.getByLabelText('Token do Voice Monkey'), 'vm-token-123');
  await fireEvent.press(screen.getByRole('button', { name: 'Salvar avisos' }));
  expect(update).toHaveBeenLastCalledWith({
    voiceMonkeyDevice: 'echo-balcao',
    voiceMonkeyToken: 'vm-token-123',
  });
});

it('unlinks only after the confirmation', async () => {
  jest.spyOn(data.alexa, 'getSettings').mockResolvedValue(LINKED);
  const unlink = jest.spyOn(data.alexa, 'unlink').mockResolvedValue({ ...LINKED, linked: false });
  await render(<AlexaSettingsScreen />);

  await fireEvent.press(await screen.findByRole('button', { name: 'Desvincular a Alexa' }));
  expect(unlink).not.toHaveBeenCalled();
  expect(await screen.findByText('Desvincular a Alexa?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Desvincular' }));

  expect(unlink).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Conta não vinculada')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Desvincular a Alexa' })).toBeNull();
});

it('mock layer: unlink and the write-only token', async () => {
  const before = await data.alexa.getSettings();
  expect(before.linked).toBe(true);
  expect((await data.alexa.updateSettings({ voiceMonkeyToken: 'abcdefgh' })).voiceMonkeyTokenSet).toBe(true);
  expect((await data.alexa.updateSettings({ voiceMonkeyToken: null })).voiceMonkeyTokenSet).toBe(false);
  expect((await data.alexa.unlink()).linked).toBe(false);
});
