import type { z } from 'zod';
import { HealthResponse, IdParams, OkResponse } from './common';
import { DeleteMeBody, DeleteMeResponse } from './account';
import {
  AsaasWebhookRequest,
  AsaasWebhookResponse,
  BillingPlanChoice,
  BillingSummary,
  SubscribeBody,
} from './billing';
import {
  EmailCodeRequestBody,
  EmailCodeResponse,
  EmailCodeVerifyBody,
  PasswordLoginBody,
  PasswordResetBody,
  PasswordResetRequestBody,
  SignupRequestBody,
  SignupVerifyBody,
} from './signup';
import {
  AiPauseRequest,
  AiSettings,
  AiSettingsPatch,
  AiStatus,
  MessagePreviewRequest,
  MessagePreviewResponse,
} from './ai';
import {
  AlexaOAuthAuthorizeQuery,
  AlexaOAuthTokenRequest,
  AlexaOAuthTokenResponse,
  AlexaSettingsPatch,
  AlexaSettingsResponse,
  AlexaSkillRequest,
  AlexaSkillResponse,
} from './alexa';
import {
  AgendaQuery,
  AgendaResponse,
  AppointmentActionResponse,
  AppointmentCancel,
  AppointmentConfirmResponse,
  AppointmentCreate,
  AppointmentDetail,
  AppointmentReschedule,
  DelayNoticeBody,
  ClientAppointmentsResponse,
  DelayNoticeResponse,
  SlotsQuery,
  SlotsResponse,
} from './appointments';
import {
  FirebaseLoginBody,
  MePatch,
  MePatchResponse,
  MeResponse,
  OtpRequestBody,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  RefreshBody,
  RefreshResponse,
} from './auth';
import {
  Client,
  ClientCreate,
  ClientListQuery,
  ClientListResponse,
  ClientStats,
  ClientUpdate,
} from './clients';
import {
  ConversationGetResponse,
  ConversationListQuery,
  ConversationListResponse,
  HandoffBody,
  HandoffResponse,
  MessageListQuery,
  MessageListResponse,
  SendMessageBody,
  SendMessageResponse,
} from './conversations';
import {
  DecisionAnswerBody,
  DecisionAnswerResponse,
  DecisionListQuery,
  DecisionListResponse,
  DecisionTakeOverResponse,
} from './decisions';
import { DeviceRegisterBody, DeviceRegisterResponse } from './devices';
import { KitLeadCreate, KitLeadCreateResponse, LeadCreate, LeadCreateResponse } from './leads';
import { EmailConfirmQuery } from './email';
import {
  SalonClientsQuery,
  SalonClientsResponse,
  SalonDayQuery,
  SalonDayResponse,
  SalonPlanResponse,
  SalonReportsQuery,
  SalonReportsResponse,
  TeamListResponse,
  TeamMember,
  TeamMemberCreate,
  TeamMemberUpdate,
} from './salon-panel';
import {
  TimeOff,
  TimeOffCreate,
  TimeOffListQuery,
  TimeOffListResponse,
  TimeOffUpdate,
  WorkingHours,
  WorkingHoursCreate,
  WorkingHoursListResponse,
  WorkingHoursReplaceBody,
  WorkingHoursUpdate,
} from './schedule';
import {
  Service,
  ServiceCreate,
  ServiceListQuery,
  ServiceListResponse,
  ServiceReorderBody,
  ServiceUpdate,
} from './services';
import {
  VoiceCommandBody,
  VoiceCommandResponse,
  VoiceSummaryQuery,
  VoiceSummaryResponse,
} from './voice';
import {
  WaitlistEntryCreate,
  WaitlistEntryUpdate,
  WaitlistEntryView,
  WaitlistListResponse,
  WaitlistOfferBody,
  WaitlistOfferResponse,
  WaitlistRulePatch,
  WaitlistRuleResponse,
} from './waitlist';
import {
  WhatsAppPairingCodeQuery,
  WhatsAppPairingCodeResponse,
  WhatsAppQrResponse,
  WhatsAppSessionCreate,
  WhatsAppStatusResponse,
  WhatsAppWebhookBody,
  WhatsAppWebhookParams,
} from './whatsapp';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** `jwt`: Bearer access token; `owner`: JWT + role owner; `public`: no auth (rate limited or signed). */
export type RouteAuth = 'jwt' | 'owner' | 'public';

export interface RouteContract {
  method: HttpMethod;
  /** Path under `/v1`, Fastify style (`/appointments/:id`). */
  path: string;
  auth: RouteAuth;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

const r = <C extends RouteContract>(c: C) => c;
const NoContent = OkResponse;
const crud = <E extends z.ZodType, L extends z.ZodType, C extends z.ZodType, U extends z.ZodType>(
  base: string,
  entity: E,
  list: L,
  create: C,
  update: U,
  auth: RouteAuth = 'jwt',
) => ({
  list: r({ method: 'GET', path: base, auth, response: list }),
  create: r({ method: 'POST', path: base, auth, body: create, response: entity }),
  get: r({ method: 'GET', path: `${base}/:id`, auth, params: IdParams, response: entity }),
  update: r({
    method: 'PATCH',
    path: `${base}/:id`,
    auth,
    params: IdParams,
    body: update,
    response: entity,
  }),
  remove: r({ method: 'DELETE', path: `${base}/:id`, auth, params: IdParams, response: NoContent }),
});

/**
 * Every HTTP route of plan section 9, with its input and output schemas.
 * The API registers handlers against these; the app/web clients and the OpenAPI spec use them too.
 * `WS /realtime` is described by `RealtimeQuery` / `RealtimeEvent` in `realtime.ts`.
 */
export const API_PREFIX = '/v1';

export const routes = {
  system: {
    health: r({ method: 'GET', path: '/health', auth: 'public', response: HealthResponse }),
  },
  auth: {
    otpRequest: r({
      method: 'POST',
      path: '/auth/otp/request',
      auth: 'public',
      body: OtpRequestBody,
      response: OtpRequestResponse,
    }),
    otpVerify: r({
      method: 'POST',
      path: '/auth/otp/verify',
      auth: 'public',
      body: OtpVerifyBody,
      response: OtpVerifyResponse,
    }),
    firebaseLogin: r({
      method: 'POST',
      path: '/auth/firebase',
      auth: 'public',
      body: FirebaseLoginBody,
      response: OtpVerifyResponse,
    }),
    refresh: r({
      method: 'POST',
      path: '/auth/refresh',
      auth: 'public',
      body: RefreshBody,
      response: RefreshResponse,
    }),
    /**
     * Ends this session on the server: the refresh token (and every token rotated from it) stops
     * working. Always `ok`, even for an unknown or expired token.
     */
    logout: r({
      method: 'POST',
      path: '/auth/logout',
      auth: 'public',
      body: RefreshBody,
      response: OkResponse,
    }),
    me: r({ method: 'GET', path: '/me', auth: 'jwt', response: MeResponse }),
    updateMe: r({
      method: 'PATCH',
      path: '/me',
      auth: 'jwt',
      body: MePatch,
      response: MePatchResponse,
    }),
    deleteMe: r({
      method: 'DELETE',
      path: '/me',
      auth: 'jwt',
      body: DeleteMeBody,
      response: DeleteMeResponse,
    }),
  },
  site: {
    createLead: r({
      method: 'POST',
      path: '/leads',
      auth: 'public',
      body: LeadCreate,
      response: LeadCreateResponse,
    }),
  },
  email: {
    /** Sends a new confirmation link to the pending address (cooldown 60 s). */
    resendConfirmation: r({
      method: 'POST',
      path: '/me/email/resend',
      auth: 'jwt',
      response: OkResponse,
    }),
    /** Link from the e-mail: redirects (302) to the site page `/email-confirmado?status=…`. */
    confirm: r({
      method: 'GET',
      path: '/email/confirm',
      auth: 'public',
      query: EmailConfirmQuery,
      response: OkResponse,
    }),
  },
  services: {
    ...crud('/services', Service, ServiceListResponse, ServiceCreate, ServiceUpdate),
    list: r({
      method: 'GET',
      path: '/services',
      auth: 'jwt',
      query: ServiceListQuery,
      response: ServiceListResponse,
    }),
    reorder: r({
      method: 'POST',
      path: '/services/reorder',
      auth: 'jwt',
      body: ServiceReorderBody,
      response: ServiceListResponse,
    }),
  },
  workingHours: {
    ...crud(
      '/working-hours',
      WorkingHours,
      WorkingHoursListResponse,
      WorkingHoursCreate,
      WorkingHoursUpdate,
    ),
    replace: r({
      method: 'PUT',
      path: '/working-hours',
      auth: 'jwt',
      body: WorkingHoursReplaceBody,
      response: WorkingHoursListResponse,
    }),
  },
  timeOff: {
    ...crud('/time-off', TimeOff, TimeOffListResponse, TimeOffCreate, TimeOffUpdate),
    list: r({
      method: 'GET',
      path: '/time-off',
      auth: 'jwt',
      query: TimeOffListQuery,
      response: TimeOffListResponse,
    }),
  },
  clients: {
    ...crud('/clients', Client, ClientListResponse, ClientCreate, ClientUpdate),
    list: r({
      method: 'GET',
      path: '/clients',
      auth: 'jwt',
      query: ClientListQuery,
      response: ClientListResponse,
    }),
    stats: r({
      method: 'GET',
      path: '/clients/:id/stats',
      auth: 'jwt',
      params: IdParams,
      response: ClientStats,
    }),
    appointments: r({
      method: 'GET',
      path: '/clients/:id/appointments',
      auth: 'jwt',
      params: IdParams,
      response: ClientAppointmentsResponse,
    }),
  },
  agenda: {
    day: r({
      method: 'GET',
      path: '/agenda',
      auth: 'jwt',
      query: AgendaQuery,
      response: AgendaResponse,
    }),
    slots: r({
      method: 'GET',
      path: '/slots',
      auth: 'jwt',
      query: SlotsQuery,
      response: SlotsResponse,
    }),
    create: r({
      method: 'POST',
      path: '/appointments',
      auth: 'jwt',
      body: AppointmentCreate,
      response: AppointmentDetail,
    }),
    get: r({
      method: 'GET',
      path: '/appointments/:id',
      auth: 'jwt',
      params: IdParams,
      response: AppointmentDetail,
    }),
    reschedule: r({
      method: 'POST',
      path: '/appointments/:id/reschedule',
      auth: 'jwt',
      params: IdParams,
      body: AppointmentReschedule,
      response: AppointmentActionResponse,
    }),
    cancel: r({
      method: 'POST',
      path: '/appointments/:id/cancel',
      auth: 'jwt',
      params: IdParams,
      body: AppointmentCancel,
      response: AppointmentActionResponse,
    }),
    confirm: r({
      method: 'POST',
      path: '/appointments/:id/confirm',
      auth: 'jwt',
      params: IdParams,
      response: AppointmentConfirmResponse,
    }),
    arrive: r({
      method: 'POST',
      path: '/appointments/:id/arrive',
      auth: 'jwt',
      params: IdParams,
      response: AppointmentActionResponse,
    }),
    done: r({
      method: 'POST',
      path: '/appointments/:id/done',
      auth: 'jwt',
      params: IdParams,
      response: AppointmentActionResponse,
    }),
    noShow: r({
      method: 'POST',
      path: '/appointments/:id/no-show',
      auth: 'jwt',
      params: IdParams,
      response: AppointmentActionResponse,
    }),
    delayNotice: r({
      method: 'POST',
      path: '/appointments/:id/delay-notice',
      auth: 'jwt',
      params: IdParams,
      body: DelayNoticeBody,
      response: DelayNoticeResponse,
    }),
  },
  whatsapp: {
    createSession: r({
      method: 'POST',
      path: '/whatsapp/session',
      auth: 'jwt',
      body: WhatsAppSessionCreate,
      response: WhatsAppStatusResponse,
    }),
    qr: r({ method: 'GET', path: '/whatsapp/qr', auth: 'jwt', response: WhatsAppQrResponse }),
    pairingCode: r({
      method: 'GET',
      path: '/whatsapp/pairing-code',
      auth: 'jwt',
      query: WhatsAppPairingCodeQuery,
      response: WhatsAppPairingCodeResponse,
    }),
    status: r({
      method: 'GET',
      path: '/whatsapp/status',
      auth: 'jwt',
      response: WhatsAppStatusResponse,
    }),
    deleteSession: r({
      method: 'DELETE',
      path: '/whatsapp/session',
      auth: 'jwt',
      response: NoContent,
    }),
    webhook: r({
      method: 'POST',
      path: '/webhooks/whatsapp/:instance',
      auth: 'public',
      params: WhatsAppWebhookParams,
      body: WhatsAppWebhookBody,
      response: NoContent,
    }),
  },
  conversations: {
    list: r({
      method: 'GET',
      path: '/conversations',
      auth: 'jwt',
      query: ConversationListQuery,
      response: ConversationListResponse,
    }),
    get: r({
      method: 'GET',
      path: '/conversations/:id',
      auth: 'jwt',
      params: IdParams,
      response: ConversationGetResponse,
    }),
    messages: r({
      method: 'GET',
      path: '/conversations/:id/messages',
      auth: 'jwt',
      params: IdParams,
      query: MessageListQuery,
      response: MessageListResponse,
    }),
    send: r({
      method: 'POST',
      path: '/conversations/:id/messages',
      auth: 'jwt',
      params: IdParams,
      body: SendMessageBody,
      response: SendMessageResponse,
    }),
    handoff: r({
      method: 'POST',
      path: '/conversations/:id/handoff',
      auth: 'jwt',
      params: IdParams,
      body: HandoffBody,
      response: HandoffResponse,
    }),
  },
  decisions: {
    list: r({
      method: 'GET',
      path: '/decisions',
      auth: 'jwt',
      query: DecisionListQuery,
      response: DecisionListResponse,
    }),
    answer: r({
      method: 'POST',
      path: '/decisions/:id/answer',
      auth: 'jwt',
      params: IdParams,
      body: DecisionAnswerBody,
      response: DecisionAnswerResponse,
    }),
    takeOver: r({
      method: 'POST',
      path: '/decisions/:id/take-over',
      auth: 'jwt',
      params: IdParams,
      response: DecisionTakeOverResponse,
    }),
  },
  waitlist: {
    ...crud(
      '/waitlist',
      WaitlistEntryView,
      WaitlistListResponse,
      WaitlistEntryCreate,
      WaitlistEntryUpdate,
    ),
    offer: r({
      method: 'POST',
      path: '/waitlist/:id/offer',
      auth: 'jwt',
      params: IdParams,
      body: WaitlistOfferBody,
      response: WaitlistOfferResponse,
    }),
    updateRule: r({
      method: 'PATCH',
      path: '/waitlist/rule',
      auth: 'jwt',
      body: WaitlistRulePatch,
      response: WaitlistRuleResponse,
    }),
  },
  ai: {
    pause: r({
      method: 'POST',
      path: '/ai/pause',
      auth: 'jwt',
      body: AiPauseRequest,
      response: AiStatus,
    }),
    resume: r({ method: 'POST', path: '/ai/resume', auth: 'jwt', response: AiStatus }),
    updateSettings: r({
      method: 'PATCH',
      path: '/ai/settings',
      auth: 'jwt',
      body: AiSettingsPatch,
      response: AiSettings,
    }),
    messagePreview: r({
      method: 'POST',
      path: '/messages/preview',
      auth: 'jwt',
      body: MessagePreviewRequest,
      response: MessagePreviewResponse,
    }),
  },
  voice: {
    command: r({
      method: 'POST',
      path: '/voice/command',
      auth: 'jwt',
      body: VoiceCommandBody,
      response: VoiceCommandResponse,
    }),
    summary: r({
      method: 'GET',
      path: '/voice/summary',
      auth: 'jwt',
      query: VoiceSummaryQuery,
      response: VoiceSummaryResponse,
    }),
  },
  devices: {
    register: r({
      method: 'POST',
      path: '/devices',
      auth: 'jwt',
      body: DeviceRegisterBody,
      response: DeviceRegisterResponse,
    }),
    remove: r({
      method: 'DELETE',
      path: '/devices/:id',
      auth: 'jwt',
      params: IdParams,
      response: NoContent,
    }),
  },
  salon: {
    day: r({
      method: 'GET',
      path: '/salon/day',
      auth: 'owner',
      query: SalonDayQuery,
      response: SalonDayResponse,
    }),
    reports: r({
      method: 'GET',
      path: '/salon/reports',
      auth: 'owner',
      query: SalonReportsQuery,
      response: SalonReportsResponse,
    }),
    team: crud(
      '/salon/team',
      TeamMember,
      TeamListResponse,
      TeamMemberCreate,
      TeamMemberUpdate,
      'owner',
    ),
    clients: r({
      method: 'GET',
      path: '/salon/clients',
      auth: 'owner',
      query: SalonClientsQuery,
      response: SalonClientsResponse,
    }),
    plan: r({ method: 'GET', path: '/salon/plan', auth: 'owner', response: SalonPlanResponse }),
    /** Owner answers a pending Decision of any professional of the salon (panel side list). */
    answerDecision: r({
      method: 'POST',
      path: '/salon/decisions/:id/answer',
      auth: 'owner',
      params: IdParams,
      body: DecisionAnswerBody,
      response: DecisionAnswerResponse,
    }),
    /** Owner moves an appointment of any professional of the salon (panel drag to reschedule). */
    rescheduleAppointment: r({
      method: 'POST',
      path: '/salon/appointments/:id/reschedule',
      auth: 'owner',
      params: IdParams,
      body: AppointmentReschedule,
      response: AppointmentActionResponse,
    }),
    kitLead: r({
      method: 'POST',
      path: '/kit-leads',
      auth: 'jwt',
      body: KitLeadCreate,
      response: KitLeadCreateResponse,
    }),
  },
  alexa: {
    skill: r({
      method: 'POST',
      path: '/alexa/skill',
      auth: 'public',
      body: AlexaSkillRequest,
      response: AlexaSkillResponse,
    }),
    /** Account linking: shows the phone + code login page, then redirects to Amazon with `code`. */
    oauthAuthorize: r({
      method: 'GET',
      path: '/alexa/oauth/authorize',
      auth: 'public',
      query: AlexaOAuthAuthorizeQuery,
      response: OkResponse,
    }),
    oauthToken: r({
      method: 'POST',
      path: '/alexa/oauth/token',
      auth: 'public',
      body: AlexaOAuthTokenRequest,
      response: AlexaOAuthTokenResponse,
    }),
    /** Per-professional Voice Monkey announcement settings (token is write-only). */
    settings: r({
      method: 'GET',
      path: '/alexa/settings',
      auth: 'jwt',
      response: AlexaSettingsResponse,
    }),
    updateSettings: r({
      method: 'PATCH',
      path: '/alexa/settings',
      auth: 'jwt',
      body: AlexaSettingsPatch,
      response: AlexaSettingsResponse,
    }),
    /** Unlinks the Alexa account: every Alexa token of this professional stops working. */
    unlink: r({
      method: 'DELETE',
      path: '/alexa/link',
      auth: 'jwt',
      response: AlexaSettingsResponse,
    }),
  },
  /** Free sign-up and login by e-mail code (signup.ts); per-IP limit like /auth/otp/*. */
  signup: {
    request: r({
      method: 'POST',
      path: '/auth/signup/request',
      auth: 'public',
      body: SignupRequestBody,
      response: EmailCodeResponse,
    }),
    verify: r({
      method: 'POST',
      path: '/auth/signup/verify',
      auth: 'public',
      body: SignupVerifyBody,
      response: OtpVerifyResponse,
    }),
    emailCodeRequest: r({
      method: 'POST',
      path: '/auth/email-code/request',
      auth: 'public',
      body: EmailCodeRequestBody,
      response: EmailCodeResponse,
    }),
    emailCodeVerify: r({
      method: 'POST',
      path: '/auth/email-code/verify',
      auth: 'public',
      body: EmailCodeVerifyBody,
      response: OtpVerifyResponse,
    }),
    passwordLogin: r({
      method: 'POST',
      path: '/auth/password/login',
      auth: 'public',
      body: PasswordLoginBody,
      response: OtpVerifyResponse,
    }),
    passwordResetRequest: r({
      method: 'POST',
      path: '/auth/password/reset/request',
      auth: 'public',
      body: PasswordResetRequestBody,
      response: EmailCodeResponse,
    }),
    passwordReset: r({
      method: 'POST',
      path: '/auth/password/reset',
      auth: 'public',
      body: PasswordResetBody,
      response: OtpVerifyResponse,
    }),
  },
  /** Subscription (docs/COBRANCA.md): only the owner; without ASAAS_API_KEY writes are 503. */
  billing: {
    get: r({ method: 'GET', path: '/billing', auth: 'owner', response: BillingSummary }),
    subscribe: r({
      method: 'POST',
      path: '/billing/subscription',
      auth: 'owner',
      body: SubscribeBody,
      response: BillingSummary,
    }),
    change: r({
      method: 'PATCH',
      path: '/billing/subscription',
      auth: 'owner',
      body: BillingPlanChoice,
      response: BillingSummary,
    }),
    cancel: r({
      method: 'DELETE',
      path: '/billing/subscription',
      auth: 'owner',
      response: BillingSummary,
    }),
    /** Asaas events; header `asaas-access-token` = ASAAS_WEBHOOK_TOKEN. Idempotent. */
    webhook: r({
      method: 'POST',
      path: '/webhooks/asaas',
      auth: 'public',
      body: AsaasWebhookRequest,
      response: AsaasWebhookResponse,
    }),
  },
} as const;

/** Flat list, handy for OpenAPI generation and coverage tests. */
export function listRoutes(): RouteContract[] {
  const out: RouteContract[] = [];
  const walk = (node: unknown) => {
    if (node && typeof node === 'object' && 'method' in node && 'path' in node)
      out.push(node as RouteContract);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(routes);
  return out;
}
