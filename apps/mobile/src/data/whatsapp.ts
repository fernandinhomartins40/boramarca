import type {
  PhoneE164,
  WhatsAppPairingCodeResponse,
  WhatsAppQrResponse,
  WhatsAppSessionCreate,
  WhatsAppStatus,
  WhatsAppStatusResponse,
} from '@boramarca/shared';
import { DEMO_PHONE, professional } from './mock/fixtures';
import { minutesFromNow, nowIso, reply } from './mock/util';

/**
 * WhatsApp connection (prompt 02): session, QR, pairing code, status. Owner: agent B2; api: D1.
 * Status flow: waiting_qr → connecting → connected | error; `disconnected` after a drop.
 */
export interface WhatsAppData {
  createSession(body: WhatsAppSessionCreate): Promise<WhatsAppStatusResponse>;
  getStatus(): Promise<WhatsAppStatusResponse>;
  getQr(): Promise<WhatsAppQrResponse>;
  getPairingCode(phone: PhoneE164): Promise<WhatsAppPairingCodeResponse>;
  disconnect(): Promise<void>;
}

/** Mock connection state. Starts connected (demo account); dev menu can drop it. */
export const mockWhatsAppState = {
  status: 'connected' as WhatsAppStatus,
  /** When a session was created: the mock walks waiting_qr → connecting → connected by time. */
  startedAt: 0,
  /** Force the next pairing to end in `error` ("Tentar de novo" path). */
  failNextPairing: false,
  /** Next QR / pairing code expires in a few seconds (dev menu: "código expirado"). */
  expireNextCode: false,
  errorMessage: null as string | null,
};

const QR_TTL_SECONDS = 45;
const EXPIRED_TTL_SECONDS = 5;

function codeTtlMinutes() {
  const short = mockWhatsAppState.expireNextCode;
  mockWhatsAppState.expireNextCode = false;
  return (short ? EXPIRED_TTL_SECONDS : QR_TTL_SECONDS) / 60;
}
const WAIT_MS = 6000;
const CONNECT_MS = 3000;

function current(): WhatsAppStatusResponse {
  const s = mockWhatsAppState;
  if (s.startedAt && (s.status === 'waiting_qr' || s.status === 'connecting')) {
    const elapsed = Date.now() - s.startedAt;
    if (elapsed > WAIT_MS + CONNECT_MS) {
      s.status = s.failNextPairing ? 'error' : 'connected';
      s.errorMessage = s.failNextPairing ? 'Não conseguimos conectar. Tente de novo.' : null;
      s.failNextPairing = false;
    } else if (elapsed > WAIT_MS) s.status = 'connecting';
  }
  const connected = s.status === 'connected';
  return {
    status: s.status,
    phone: connected ? DEMO_PHONE : null,
    profileName: connected ? professional.name : null,
    profilePictureUrl: null,
    errorMessage: s.status === 'error' ? s.errorMessage : null,
    updatedAt: nowIso(),
  };
}

export const mockWhatsApp: WhatsAppData = {
  async createSession() {
    Object.assign(mockWhatsAppState, {
      status: 'waiting_qr',
      startedAt: Date.now(),
      errorMessage: null,
    });
    return reply(current());
  },
  async getStatus() {
    return reply(current());
  },
  async getQr() {
    return reply({
      qr: `boramarca-demo-${Date.now()}`,
      expiresAt: minutesFromNow(codeTtlMinutes()),
    });
  },
  async getPairingCode() {
    return reply({ code: 'BORA4826', expiresAt: minutesFromNow(codeTtlMinutes()) });
  },
  async disconnect() {
    Object.assign(mockWhatsAppState, { status: 'disconnected', startedAt: 0 });
    return reply(undefined);
  },
};
