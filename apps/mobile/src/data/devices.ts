import type { Device, DeviceRegisterBody, Id } from '@boramarca/shared';
import { ids } from './mock/fixtures';
import { base, newId, reply } from './mock/util';

/**
 * This phone's push token (POST /devices, upsert by token; DELETE /devices/:id on "Sair").
 * Owner: D1. Registration runs after login when notifications are already allowed
 * (src/lib/api/push.ts); the api `auth.signOut` removes the device registered in this session.
 */
export interface DevicesData {
  register(body: DeviceRegisterBody): Promise<Device>;
  remove(id: Id): Promise<void>;
}

export const mockDevices: DevicesData = {
  async register(body) {
    return reply({ ...base(newId(), 0), professionalId: ids.professional, ...body });
  },
  async remove() {
    return reply(undefined);
  },
};
