import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { showToast } from '@/components/Toast';
import {
  getNotificationPermission,
  handleDecisionNotificationResponse,
  reportInBackground,
  setupDecisionNotifications,
  type ResponseOutcome,
} from './decisionNotifications';

const openDecision = (decisionId: string) =>
  router.push({ pathname: '/decisoes', params: { decisionId } });

function react(outcome: ResponseOutcome) {
  if (outcome.kind === 'ignored') return;
  if (outcome.kind === 'open') return openDecision(outcome.decisionId);
  // the action ran without bringing the app forward: tell the user with a notification
  if (AppState.currentState !== 'active') return reportInBackground(outcome);
  if (outcome.kind === 'answered') showToast(outcome.message, 'success');
  else if (outcome.kind === 'failed') showToast(outcome.message, 'danger');
  else openDecision(outcome.decisionId);
}

/**
 * Mounted once in app/_layout.tsx: prepares the channel and category (no permission prompt here)
 * and handles taps on decision notifications, also the one that cold-started the app.
 */
export function useDecisionNotifications() {
  useEffect(() => {
    // when not granted yet, requestNotificationPermission() sets them up right before asking
    getNotificationPermission()
      .then((p) => (p === 'granted' ? setupDecisionNotifications() : undefined))
      .catch(() => undefined);
    const handle = (r: Notifications.NotificationResponse) =>
      handleDecisionNotificationResponse(r)
        .then(react)
        .catch(() => undefined);
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      Notifications.clearLastNotificationResponse();
      void handle(last);
    }
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
