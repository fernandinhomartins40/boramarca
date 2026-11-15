import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { NotificationResponse } from 'expo-notifications';
import { data } from '@/data';
import { mockDecisions } from '@/data/decisions';
import { uid } from '@/data/mock/util';
import {
  decisionPayload,
  handleDecisionNotificationResponse,
  optionForAction,
  runDecisionNotificationTask,
  setupDecisionNotifications,
} from './decisionNotifications';

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { HIGH: 4 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  dismissNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'local-id'),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
}));

const beatriz = uid(0x501); // encaixe: "Sim, pode marcar" / "Não"
const juliana = uid(0x503); // novo_horario: 10h / 16h / Nenhum

let seq = 0;
function response(decisionId: string, actionIdentifier: string): NotificationResponse {
  const d = mockDecisions.find((x) => x.id === decisionId)!;
  return {
    actionIdentifier,
    notification: {
      date: Date.now(),
      request: {
        identifier: `push-${seq++}`,
        content: {
          title: d.question,
          subtitle: null,
          body: null,
          data: {
            type: 'decision',
            decisionId,
            options: d.options.map((o) => ({ id: o.id, label: o.label })),
          },
          sound: null,
          categoryIdentifier: 'decision',
        },
        trigger: null,
      },
    },
  } as unknown as NotificationResponse;
}

afterEach(() => jest.clearAllMocks());

it('creates the Android channel "Decisões" and the category with Sim and Não', async () => {
  await setupDecisionNotifications();
  // jest-expo runs as iOS by default: the channel is Android-only
  expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('decision', [
    expect.objectContaining({
      identifier: 'sim',
      buttonTitle: 'Sim',
      options: { opensAppToForeground: false },
    }),
    expect.objectContaining({
      identifier: 'nao',
      buttonTitle: 'Não',
      options: { opensAppToForeground: false },
    }),
  ]);
  expect(Notifications.setNotificationHandler).toHaveBeenCalled();
});

it('reads the push payload and maps Sim/Não only for yes/no decisions', () => {
  expect(decisionPayload({ type: 'other' })).toBeNull();
  expect(
    decisionPayload({ type: 'decision', decisionId: 'x', options: [{ id: 'sim' }, 3] }),
  ).toEqual({ decisionId: 'x', options: [{ id: 'sim' }] });
  const yesNo = [
    { id: 'sim', label: 'Sim, pode marcar' },
    { id: 'nao', label: 'Não' },
  ];
  expect(optionForAction('sim', yesNo)).toBe('sim');
  expect(optionForAction('nao', yesNo)).toBe('nao');
  expect(
    optionForAction('sim', [
      { id: '10h', label: '10h' },
      { id: '16h', label: '16h' },
      { id: 'nao', label: 'Nenhum' },
    ]),
  ).toBeNull();
});

it('"Sim" answers through handleDecisionAction with via notification, without opening the app', async () => {
  const answer = jest.spyOn(data.decisions, 'answer');
  const outcome = await handleDecisionNotificationResponse(response(beatriz, 'sim'));
  expect(answer).toHaveBeenCalledWith(beatriz, { optionId: 'sim', via: 'notification' });
  expect(outcome).toEqual({
    kind: 'answered',
    decisionId: beatriz,
    message: 'Pronto. Já avisei Beatriz.',
  });
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalled();
  expect(mockDecisions.find((d) => d.id === beatriz)).toMatchObject({
    status: 'resolved',
    resolvedVia: 'notification',
  });
  answer.mockRestore();
});

it('the same response delivered twice is answered once', async () => {
  const r = response(uid(0x502), 'nao');
  const answer = jest.spyOn(data.decisions, 'answer');
  await handleDecisionNotificationResponse(r);
  expect(await handleDecisionNotificationResponse(r)).toEqual({ kind: 'ignored' });
  expect(answer).toHaveBeenCalledTimes(1);
  answer.mockRestore();
});

it('a tap on the body opens the decision; Sim on a multi-option one asks to choose in the app', async () => {
  expect(
    await handleDecisionNotificationResponse(
      response(juliana, Notifications.DEFAULT_ACTION_IDENTIFIER),
    ),
  ).toEqual({ kind: 'open', decisionId: juliana });
  expect(await handleDecisionNotificationResponse(response(juliana, 'sim'))).toEqual({
    kind: 'choose',
    decisionId: juliana,
  });
});

it('an error comes back as "failed" (already answered)', async () => {
  // Beatriz was answered above
  expect(await handleDecisionNotificationResponse(response(beatriz, 'nao'))).toEqual({
    kind: 'failed',
    decisionId: beatriz,
    message: 'Essa decisão já foi resolvida',
  });
});

it('the background task answers and reports with a plain notification', async () => {
  const diego = uid(0x504); // atraso: two options, no "nao" → has to choose
  const camila = uid(0x505); // dúvida: "Sim, faço" / "Não faço"
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  await runDecisionNotificationTask(response(camila, 'sim'));
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({
        title: 'Respondido',
        data: { type: 'decision', decisionId: camila },
      }),
    }),
  );
  await runDecisionNotificationTask(response(diego, 'sim'));
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.objectContaining({ title: 'Escolha no app' }) }),
  );
  // a received (not tapped) notification is ignored
  await runDecisionNotificationTask({ notification: null, data: {} });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});
