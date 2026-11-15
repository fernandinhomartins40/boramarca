import { routes } from '@boramarca/shared';
import type { ApiClient } from '@/lib/api/client';
import type { DataLayer } from './index';

/**
 * API implementation of every domain (plan section 9), on top of the HTTP client of src/lib/api:
 * paths and response schemas come from `routes` (packages/shared), errors arrive as `DataError`.
 * Pure (no React Native import), so scripts/roteiro-api.ts runs it under Node too.
 */
export function createApiData(api: ApiClient): DataLayer {
  const id = (value: string) => ({ params: { id: value } });
  const r = routes;
  /** Device registered in this session, removed on "Sair". */
  let deviceId: string | null = null;

  const devices: DataLayer['devices'] = {
    async register(body) {
      const device = await api.call(r.devices.register, { body });
      deviceId = device.id;
      return device;
    },
    async remove(deviceToRemove) {
      await api.call(r.devices.remove, id(deviceToRemove));
      if (deviceToRemove === deviceId) deviceId = null;
    },
  };

  return {
    auth: {
      requestOtp: (body) => api.call(r.auth.otpRequest, { body }),
      verifyOtp: (body) => api.call(r.auth.otpVerify, { body }),
      // Stop the pushes to this phone, then end the session on the server (POST /auth/logout
      // revokes this refresh token and its rotations). Both tolerate failure: the caller
      // (features/auth signOut) forgets the tokens anyway.
      async signOut() {
        if (deviceId) await devices.remove(deviceId).catch(() => undefined);
        const refreshToken = api.refreshToken();
        if (refreshToken)
          await api.call(r.auth.logout, { body: { refreshToken } }).catch(() => undefined);
      },
    },
    profile: {
      getMe: () => api.call(r.auth.me),
      updateMe: (body) => api.call(r.auth.updateMe, { body }),
      // no GET /ai/settings: the same fields come in GET /me
      async getAiSettings() {
        const { professional: p } = await api.call(r.auth.me);
        return {
          aiEnabled: p.aiEnabled,
          aiPausedUntil: p.aiPausedUntil,
          aiTone: p.aiTone,
          autonomy: p.autonomy,
        };
      },
      updateAiSettings: (body) => api.call(r.ai.updateSettings, { body }),
      pauseAi: (body) => api.call(r.ai.pause, { body }),
      resumeAi: () => api.call(r.ai.resume),
      // z.coerce.boolean reads "false" as true: only send the flag when it is on
      listServices: async (includeInactive) =>
        (
          await api.call(r.services.list, {
            query: includeInactive ? { includeInactive: true } : {},
          })
        ).items,
      createService: (body) => api.call(r.services.create, { body }),
      updateService: (serviceId, body) => api.call(r.services.update, { ...id(serviceId), body }),
      deleteService: async (serviceId) => void (await api.call(r.services.remove, id(serviceId))),
      reorderServices: async (ids) => (await api.call(r.services.reorder, { body: { ids } })).items,
      getWorkingHours: async () => (await api.call(r.workingHours.list)).items,
      replaceWorkingHours: async (body) => (await api.call(r.workingHours.replace, { body })).items,
      listTimeOff: async () => (await api.call(r.timeOff.list)).items,
      createTimeOff: (body) => api.call(r.timeOff.create, { body }),
      deleteTimeOff: async (timeOffId) => void (await api.call(r.timeOff.remove, id(timeOffId))),
      previewMessage: (body) => api.call(r.ai.messagePreview, { body }),
    },
    whatsapp: {
      createSession: (body) => api.call(r.whatsapp.createSession, { body }),
      getStatus: () => api.call(r.whatsapp.status),
      getQr: () => api.call(r.whatsapp.qr),
      getPairingCode: (phone) => api.call(r.whatsapp.pairingCode, { query: { phone } }),
      disconnect: async () => void (await api.call(r.whatsapp.deleteSession)),
    },
    account: {
      deleteMe: (body) => api.call(r.auth.deleteMe, { body }),
      createKitLead: (body) => api.call(r.salon.kitLead, { body }),
    },
    agenda: {
      getDay: (date) => api.call(r.agenda.day, { query: { date } }),
      getSlots: (date, serviceIds) =>
        api.call(r.agenda.slots, { query: { date, serviceIds: serviceIds.join(',') } }),
      getAppointment: (appointmentId) => api.call(r.agenda.get, id(appointmentId)),
      create: (body) => api.call(r.agenda.create, { body }),
      reschedule: (a, body) => api.call(r.agenda.reschedule, { ...id(a), body }),
      cancel: (a, body) => api.call(r.agenda.cancel, { ...id(a), body }),
      confirm: (a) => api.call(r.agenda.confirm, id(a)),
      arrive: (a) => api.call(r.agenda.arrive, id(a)),
      done: (a) => api.call(r.agenda.done, id(a)),
      noShow: (a) => api.call(r.agenda.noShow, id(a)),
      sendDelayNotice: (a, body) => api.call(r.agenda.delayNotice, { ...id(a), body }),
      listByClient: (clientId) => api.call(r.clients.appointments, id(clientId)),
    },
    clients: {
      list: (query = {}) => api.call(r.clients.list, { query }),
      get: (clientId) => api.call(r.clients.get, id(clientId)),
      stats: (clientId) => api.call(r.clients.stats, id(clientId)),
      create: (body) => api.call(r.clients.create, { body }),
      update: (clientId, body) => api.call(r.clients.update, { ...id(clientId), body }),
      remove: async (clientId) => void (await api.call(r.clients.remove, id(clientId))),
    },
    waitlist: {
      list: () => api.call(r.waitlist.list),
      add: (body) => api.call(r.waitlist.create, { body }),
      update: (entryId, body) => api.call(r.waitlist.update, { ...id(entryId), body }),
      remove: async (entryId) => void (await api.call(r.waitlist.remove, id(entryId))),
      offer: (entryId, body) => api.call(r.waitlist.offer, { ...id(entryId), body }),
      updateRule: (body) => api.call(r.waitlist.updateRule, { body }),
    },
    decisions: {
      list: (status) => api.call(r.decisions.list, { query: { status } }),
      answer: (decisionId, body) => api.call(r.decisions.answer, { ...id(decisionId), body }),
      takeOver: (decisionId) => api.call(r.decisions.takeOver, id(decisionId)),
    },
    conversations: {
      list: (query = {}) => api.call(r.conversations.list, { query }),
      get: (conversationId) => api.call(r.conversations.get, id(conversationId)),
      messages: (conversationId, query = {}) =>
        api.call(r.conversations.messages, { ...id(conversationId), query }),
      send: (conversationId, body) =>
        api.call(r.conversations.send, { ...id(conversationId), body }),
      handoff: (conversationId, body) =>
        api.call(r.conversations.handoff, { ...id(conversationId), body }),
    },
    voice: {
      command: (body) => api.call(r.voice.command, { body }),
      summary: (moment) => api.call(r.voice.summary, { query: { moment } }),
    },
    devices,
  };
}
