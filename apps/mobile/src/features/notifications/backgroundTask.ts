// Sim/Não on a decision notification with the Android app closed: only a task registered with
// expo-task-manager runs JS then (docs/PENDENCIAS-HUMANAS.md, item 11). Wired by agent D2.
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { runDecisionNotificationTask } from './decisionNotifications';

export const DECISION_NOTIFICATION_TASK = 'decision-notification-task';
TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  DECISION_NOTIFICATION_TASK,
  async ({ data }) => runDecisionNotificationTask(data),
);
Notifications.registerTaskAsync(DECISION_NOTIFICATION_TASK).catch(() => undefined);
