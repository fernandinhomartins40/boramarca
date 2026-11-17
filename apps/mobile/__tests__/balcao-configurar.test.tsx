import type { ComponentType } from 'react';
import { Linking, Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { balcaoMissing, balcaoMissingText } from '@/features/balcao/native/setup';

// Modo Balcão on Android: the microphone service must not start without the notification.

const mockNotif = { get: jest.fn(), request: jest.fn() };
const mockMic = { granted: true };
const mockOpen = jest.fn(async () => undefined);
const mockReplace = jest.fn();

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({ router: { replace: mockReplace, back: jest.fn() } }));
jest.mock('expo-battery', () => ({ isBatteryOptimizationEnabledAsync: async () => false }));
jest.mock('expo-device', () => ({ manufacturer: 'samsung', brand: 'samsung' }));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn(), ActivityAction: {} }));
jest.mock('@/features/balcao', () => ({ playChime: jest.fn() }));
jest.mock('@/features/notifications', () => ({
  getNotificationPermission: () => mockNotif.get(),
  requestNotificationPermission: () => mockNotif.request(),
}));
jest.mock('@/features/balcao/native', () => ({
  recognition: {
    getMicrophonePermissionsAsync: async () => ({ granted: mockMic.granted }),
    requestMicrophonePermissionsAsync: async () => ({ granted: mockMic.granted }),
  },
  balcaoSession: { open: () => mockOpen() },
  currentSpeaker: () => null,
  hasRealWakeWord: () => false,
  isWakePhrase: () => false,
  keepSpeakerAwake: { available: false, get: () => false, set: jest.fn() },
  speak: jest.fn(async () => undefined),
  wakeWord: { started: false, start: jest.fn(), stop: jest.fn() },
}));

let Screen: ComponentType;
beforeAll(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- after Platform is Android
  Screen = require('../app/balcao/configurar').default;
});

beforeEach(() => {
  mockMic.granted = true;
  mockNotif.get.mockReset();
  mockNotif.request.mockReset();
  mockOpen.mockClear();
  mockReplace.mockClear();
});

describe('balcaoMissing', () => {
  it('Android needs the microphone and the notification; iOS only the microphone', () => {
    expect(balcaoMissing({ android: true, mic: true, notif: 'granted' })).toEqual([]);
    expect(balcaoMissing({ android: true, mic: true, notif: 'denied' })).toEqual(['notif']);
    expect(balcaoMissing({ android: true, mic: false, notif: null })).toEqual(['mic', 'notif']);
    expect(balcaoMissing({ android: false, mic: true, notif: 'denied' })).toEqual([]);
    expect(balcaoMissingText(['mic', 'notif'])).toBe(
      'Para ativar o Modo Balcão, permita o microfone e as notificações.',
    );
  });
});

describe('Prepare seu balcão (Android)', () => {
  it('blocks "Continuar" until the notification is granted, asking for it', async () => {
    mockNotif.get.mockResolvedValue('undetermined');
    mockNotif.request.mockResolvedValue('granted');
    await render(<Screen />);

    const next = await screen.findByRole('button', { name: 'Continuar' });
    expect(next).toBeDisabled();
    expect(
      screen.getByText('Para ativar o Modo Balcão, permita as notificações.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Ativar' }));
    expect(mockNotif.request).toHaveBeenCalled();
    expect(await screen.findByText('Notificações ativadas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  it('denied for good: explains in plain words and opens the settings', async () => {
    mockNotif.get.mockResolvedValue('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await render(<Screen />);

    expect(await screen.findByText(/As notificações estão desligadas/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir ajustes' }));
    expect(openSettings).toHaveBeenCalled();
  });

  it('"Ativar" checks again and does not start the microphone when the notification was revoked', async () => {
    mockNotif.get.mockResolvedValue('granted');
    await render(<Screen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar' }));

    mockNotif.get.mockResolvedValue('denied');
    await fireEvent.press(await screen.findByRole('button', { name: 'Ativar Modo Balcão' }));
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(await screen.findByText('Prepare seu balcão')).toBeTruthy();

    // back on the checklist, which reads the permissions again when it opens
    mockNotif.get.mockResolvedValue('granted');
    await render(<Screen />);
    expect(await screen.findByText('Notificações ativadas')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Ativar Modo Balcão' }));
    expect(mockOpen).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/balcao');
  });
});
