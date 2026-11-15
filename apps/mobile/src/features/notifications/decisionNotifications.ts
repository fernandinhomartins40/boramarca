import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  DECISION_NOTIFICATION_CATEGORY_ID,
  DECISION_NOTIFICATION_CHANNEL_ID,
  type DecisionView,
} from '@boramarca/shared';
import { handleDecisionAction, yesNoPair } from '@/features/decisions';

/**
 * Decision notifications (prompt 05, plan section 11). Docs checked on 14/11/2026 at
 * docs.expo.dev/versions/latest/sdk/notifications: the category actions answer without opening the
 * app (`opensAppToForeground: false`); on Android 13 the permission prompt only appears after a
 * channel exists, so the channel is created before asking.
 *
 * Push payload (apps/api decisions service): `{ type: 'decision', decisionId, options: [{id,label}] }`
 * with `categoryId: 'decision'` and `channelId: 'decisoes'`.
 */

/** Action identifiers of the iOS category / Android action buttons. */
export const DECISION_ACTION = { yes: 'sim', no: 'nao' } as const;

export interface DecisionPayload {
  decisionId: string;
  options: { id: string; label: string }[];
}

export function decisionPayload(data: unknown): DecisionPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== 'decision' || typeof d.decisionId !== 'string') return null;
  const options = (Array.isArray(d.options) ? d.options : []).filter(
    (o): o is { id: string; label: string } =>
      !!o && typeof o === 'object' && typeof (o as { id?: unknown }).id === 'string',
  );
  return { decisionId: d.decisionId, options };
}

/**
 * Which option a "Sim"/"Não" button means. Only plain yes/no decisions are answered from the
 * notification; "10h ou 16h?" needs the app (null).
 */
export function optionForAction(
  actionId: string,
  options: DecisionPayload['options'],
): string | null {
  const pair = yesNoPair(options);
  if (!pair) return null;
  if (actionId === DECISION_ACTION.yes) return pair.yes.id;
  if (actionId === DECISION_ACTION.no) return pair.no.id;
  return null;
}

let setup: Promise<void> | null = null;

/** Handler, Android channel "Decisões" and the category with Sim/Não. Idempotent. */
export function setupDecisionNotifications(): Promise<void> {
  setup ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(DECISION_NOTIFICATION_CHANNEL_ID, {
        name: 'Decisões',
        description: 'Quando a IA precisa da sua resposta. Dá para responder Sim ou Não daqui.',
        importance: Notifications.AndroidImportance.HIGH,
        // assets/sounds/aviso.wav, bundled by the expo-notifications plugin (`sounds`); missing
        // file = default sound. A channel's sound can't change after it is created.
        sound: 'aviso.wav',
        vibrationPattern: [0, 250, 150, 250],
      });
    }
    await Notifications.setNotificationCategoryAsync(DECISION_NOTIFICATION_CATEGORY_ID, [
      {
        identifier: DECISION_ACTION.yes,
        buttonTitle: 'Sim',
        options: { opensAppToForeground: false },
      },
      {
        identifier: DECISION_ACTION.no,
        buttonTitle: 'Não',
        options: { opensAppToForeground: false },
      },
    ]);
  })().catch((e: unknown) => {
    setup = null;
    throw e;
  });
  return setup;
}

export type NotificationPermission = 'granted' | 'undetermined' | 'denied';

function permissionOf(p: Notifications.NotificationPermissionsStatus): NotificationPermission {
  // iOS: the docs say to read `ios.status` (provisional and ephemeral also deliver)
  const ios = p.ios?.status;
  if (ios !== undefined) {
    if (ios === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return 'undetermined';
    return ios === Notifications.IosAuthorizationStatus.DENIED ? 'denied' : 'granted';
  }
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return permissionOf(await Notifications.getPermissionsAsync());
}

/** Asks the system. Call only after explaining why (NotificationPermissionCard). */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  await setupDecisionNotifications().catch(() => undefined);
  return permissionOf(await Notifications.requestPermissionsAsync());
}

/** Local notification for a decision (dev simulation; in production the API pushes it). */
export async function notifyDecision(d: DecisionView): Promise<boolean> {
  if ((await getNotificationPermission()) !== 'granted') return false;
  await setupDecisionNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: d.question,
      body: d.options.map((o) => o.label).join(' · '),
      categoryIdentifier: DECISION_NOTIFICATION_CATEGORY_ID,
      data: {
        type: 'decision',
        decisionId: d.id,
        options: d.options.map((o) => ({ id: o.id, label: o.label })),
      },
    },
    trigger: Platform.OS === 'android' ? { channelId: DECISION_NOTIFICATION_CHANNEL_ID } : null,
  });
  return true;
}

export type ResponseOutcome =
  | { kind: 'ignored' }
  /** Tap on the notification body: open the decision. */
  | { kind: 'open'; decisionId: string }
  /** Sim/Não on a decision with more options: has to be answered in the app. */
  | { kind: 'choose'; decisionId: string }
  | { kind: 'answered'; decisionId: string; message: string }
  | { kind: 'failed'; decisionId: string; message: string };

const handled = new Set<string>();

/**
 * Handles a tap on a decision notification. Sim/Não go through `handleDecisionAction` with
 * `via: 'notification'`. Safe to call twice for the same response (listener + cold start).
 */
export async function handleDecisionNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<ResponseOutcome> {
  const request = response.notification.request;
  const payload = decisionPayload(request.content.data);
  if (!payload) return { kind: 'ignored' };
  const { decisionId } = payload;
  if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return { kind: 'open', decisionId };
  }
  const key = `${request.identifier}:${response.actionIdentifier}`;
  if (handled.has(key)) return { kind: 'ignored' };
  handled.add(key);
  const optionId = optionForAction(response.actionIdentifier, payload.options);
  if (!optionId) return { kind: 'choose', decisionId };
  await Notifications.dismissNotificationAsync(request.identifier).catch(() => undefined);
  try {
    const r = await handleDecisionAction(decisionId, { optionId }, 'notification');
    return { kind: 'answered', decisionId, message: r.spokenConfirmation };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Tente de novo.';
    return { kind: 'failed', decisionId, message };
  }
}

/**
 * Tells the professional what happened when the app is not on screen: a plain notification
 * (no Sim/Não) that opens the decision when tapped.
 */
export async function reportInBackground(outcome: ResponseOutcome): Promise<void> {
  if (outcome.kind === 'ignored' || outcome.kind === 'open') return;
  const content =
    outcome.kind === 'answered'
      ? { title: 'Respondido', body: outcome.message }
      : outcome.kind === 'choose'
        ? { title: 'Escolha no app', body: 'Essa decisão tem mais de uma opção. Toque para abrir.' }
        : { title: 'Não deu para responder', body: `${outcome.message} Toque para abrir.` };
  await Notifications.scheduleNotificationAsync({
    content: { ...content, data: { type: 'decision', decisionId: outcome.decisionId } },
    trigger: Platform.OS === 'android' ? { channelId: DECISION_NOTIFICATION_CHANNEL_ID } : null,
  }).catch(() => undefined);
}

/**
 * Background task body (Android runs it for action taps with the app in background or closed).
 * Wiring needs `expo-task-manager` — see docs/pendencias/C2.md.
 */
export async function runDecisionNotificationTask(
  payload: Notifications.NotificationTaskPayload,
): Promise<void> {
  if (!('actionIdentifier' in payload)) return;
  const outcome = await handleDecisionNotificationResponse(payload);
  if (AppState.currentState !== 'active') await reportInBackground(outcome);
}
