import { z } from 'zod';
import { EntityBase, Id } from './common';

export const DevicePlatform = z.enum(['android', 'ios']);
export type DevicePlatform = z.infer<typeof DevicePlatform>;

export const Device = EntityBase.extend({
  professionalId: Id,
  /** Expo push token (or native FCM/APNs token). */
  pushToken: z.string().min(1).max(500),
  platform: DevicePlatform,
});
export type Device = z.infer<typeof Device>;

// ---- POST /devices (upsert by pushToken) / DELETE /devices/:id
export const DeviceRegisterBody = z.object({
  pushToken: z.string().min(1).max(500),
  platform: DevicePlatform,
});
export type DeviceRegisterBody = z.infer<typeof DeviceRegisterBody>;
export const DeviceRegisterResponse = Device;

/** Notification channel (Android) / category (iOS) for decisions with Sim/Não actions. */
export const DECISION_NOTIFICATION_CHANNEL_ID = 'decisoes';
export const DECISION_NOTIFICATION_CATEGORY_ID = 'decision';
