// Drizzle schema for every table of plan section 3. Enum values come from @boramarca/shared.
// The appointment overlap guard (btree_gist EXCLUDE) is not expressible in Drizzle: it lives in
// the custom migration drizzle/0001_appointments_no_overlap.sql.
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  AccountDeletionOrigin,
  Actor,
  AiTone,
  AppointmentEventType,
  AppointmentOrigin,
  AppointmentStatus,
  ClientOrigin,
  ConversationHandler,
  DEFAULT_AUTONOMY,
  DEFAULT_REMINDER_LEAD_MINUTES,
  DEFAULT_TIMEZONE,
  DEFAULT_WAITLIST_RULE,
  DecisionStatus,
  DecisionType,
  DecisionVia,
  DevicePlatform,
  MessageAuthor,
  MessageDirection,
  MessageKind,
  OtpPurpose,
  Plan,
  ProfessionalRole,
  WaitlistEntryStatus,
  WaitlistOfferStatus,
  WhatsAppProvider,
  WhatsAppStatus,
  type AgendaActionCall,
  type Autonomy,
  type ClientPreferences,
  type DecisionContext,
  type DecisionOption,
  type Profession,
  type QuietHours,
  type WaitlistPreference,
  type WaitlistRule,
} from '@boramarca/shared';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const base = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---- enums
/** pgEnum keeping the literal union of a shared zod enum. */
const enumOf = <T extends string>(name: string, values: readonly T[]) =>
  pgEnum(name, values as [T, ...T[]]);

export const planEnum = enumOf('plan', Plan.options);
export const professionalRoleEnum = enumOf('professional_role', ProfessionalRole.options);
export const aiToneEnum = enumOf('ai_tone', AiTone.options);
export const otpPurposeEnum = enumOf('otp_purpose', OtpPurpose.options);
export const devicePlatformEnum = enumOf('device_platform', DevicePlatform.options);
export const clientOriginEnum = enumOf('client_origin', ClientOrigin.options);
export const appointmentStatusEnum = enumOf('appointment_status', AppointmentStatus.options);
export const appointmentOriginEnum = enumOf('appointment_origin', AppointmentOrigin.options);
export const appointmentEventTypeEnum = enumOf(
  'appointment_event_type',
  AppointmentEventType.options,
);
export const actorEnum = enumOf('actor', Actor.options);
export const whatsappProviderEnum = enumOf('whatsapp_provider', WhatsAppProvider.options);
export const whatsappStatusEnum = enumOf('whatsapp_status', WhatsAppStatus.options);
export const conversationHandlerEnum = enumOf('conversation_handler', ConversationHandler.options);
export const messageDirectionEnum = enumOf('message_direction', MessageDirection.options);
export const messageAuthorEnum = enumOf('message_author', MessageAuthor.options);
export const messageKindEnum = enumOf('message_kind', MessageKind.options);
export const decisionTypeEnum = enumOf('decision_type', DecisionType.options);
export const decisionStatusEnum = enumOf('decision_status', DecisionStatus.options);
export const decisionViaEnum = enumOf('decision_via', DecisionVia.options);
export const waitlistEntryStatusEnum = enumOf('waitlist_entry_status', WaitlistEntryStatus.options);
export const waitlistOfferStatusEnum = enumOf('waitlist_offer_status', WaitlistOfferStatus.options);
export const accountDeletionOriginEnum = enumOf(
  'account_deletion_origin',
  AccountDeletionOrigin.options,
);

// ---- tables
export const salons = pgTable('salons', {
  ...base,
  name: text('name').notNull(),
  plan: planEnum('plan').notNull().default('essencial'),
  timezone: text('timezone').notNull().default(DEFAULT_TIMEZONE),
});

export const professionals = pgTable(
  'professionals',
  {
    ...base,
    salonId: uuid('salon_id')
      .notNull()
      .references(() => salons.id, { onDelete: 'cascade' }),
    role: professionalRoleEnum('role').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull().unique(),
    professions: text('professions').array().$type<Profession[]>().notNull().default([]),
    address: text('address'),
    aiEnabled: boolean('ai_enabled').notNull().default(true),
    aiPausedUntil: ts('ai_paused_until'),
    aiTone: aiToneEnum('ai_tone').notNull().default('simpatico'),
    autonomy: jsonb('autonomy').$type<Autonomy>().notNull().default(DEFAULT_AUTONOMY),
    reminderLeadMinutes: integer('reminder_lead_minutes')
      .notNull()
      .default(DEFAULT_REMINDER_LEAD_MINUTES),
    welcomeMessage: text('welcome_message'),
    quietHours: jsonb('quiet_hours').$type<QuietHours>(),
    waitlistRule: jsonb('waitlist_rule')
      .$type<WaitlistRule>()
      .notNull()
      .default(DEFAULT_WAITLIST_RULE),
    skipMessagePreview: boolean('skip_message_preview').notNull().default(false),
    voiceRate: real('voice_rate').notNull().default(1),
  },
  (t) => [index('professionals_salon_idx').on(t.salonId)],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    ...base,
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: otpPurposeEnum('purpose').notNull().default('login'),
    expiresAt: ts('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [uniqueIndex('otp_codes_phone_purpose_uq').on(t.phone, t.purpose)],
);

export const devices = pgTable(
  'devices',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    pushToken: text('push_token').notNull().unique(),
    platform: devicePlatformEnum('platform').notNull(),
  },
  (t) => [index('devices_professional_idx').on(t.professionalId)],
);

export const services = pgTable(
  'services',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    durationMin: integer('duration_min').notNull(),
    priceCents: integer('price_cents').notNull(),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('services_professional_idx').on(t.professionalId, t.position)],
);

/** Clock times are `HH:mm` text in the salon timezone (lexicographic order == time order). */
export const workingHours = pgTable(
  'working_hours',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
    lunchStart: text('lunch_start'),
    lunchEnd: text('lunch_end'),
  },
  (t) => [uniqueIndex('working_hours_professional_weekday_uq').on(t.professionalId, t.weekday)],
);

export const timeOff = pgTable(
  'time_off',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    reason: text('reason'),
  },
  (t) => [index('time_off_professional_idx').on(t.professionalId, t.startsAt)],
);

export const clients = pgTable(
  'clients',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    preferences: jsonb('preferences').$type<ClientPreferences>().notNull().default({ notes: [] }),
    origin: clientOriginEnum('origin').notNull().default('manual'),
    firstContactAt: ts('first_contact_at'),
  },
  (t) => [uniqueIndex('clients_professional_phone_uq').on(t.professionalId, t.phone)],
);

export const appointments = pgTable(
  'appointments',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    status: appointmentStatusEnum('status').notNull().default('scheduled'),
    origin: appointmentOriginEnum('origin').notNull(),
    isFitIn: boolean('is_fit_in').notNull().default(false),
    priceCents: integer('price_cents').notNull(),
    cancelReason: text('cancel_reason'),
  },
  (t) => [
    index('appointments_professional_starts_idx').on(t.professionalId, t.startsAt),
    index('appointments_client_idx').on(t.clientId),
  ],
);

export const appointmentServices = pgTable(
  'appointment_services',
  {
    ...base,
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    durationMin: integer('duration_min').notNull(),
    priceCents: integer('price_cents').notNull(),
  },
  (t) => [index('appointment_services_appointment_idx').on(t.appointmentId)],
);

export const appointmentEvents = pgTable(
  'appointment_events',
  {
    ...base,
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    type: appointmentEventTypeEnum('type').notNull(),
    description: text('description').notNull(),
    actor: actorEnum('actor').notNull(),
  },
  (t) => [index('appointment_events_appointment_idx').on(t.appointmentId, t.createdAt)],
);

export const whatsappSessions = pgTable('whatsapp_sessions', {
  ...base,
  professionalId: uuid('professional_id')
    .notNull()
    .unique()
    .references(() => professionals.id, { onDelete: 'cascade' }),
  instanceName: text('instance_name').notNull().unique(),
  provider: whatsappProviderEnum('provider').notNull().default('baileys'),
  status: whatsappStatusEnum('status').notNull().default('disconnected'),
  phone: text('phone'),
});

export const conversations = pgTable(
  'conversations',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    handler: conversationHandlerEnum('handler').notNull().default('ai'),
    unreadCount: integer('unread_count').notNull().default(0),
    lastMessageAt: ts('last_message_at'),
  },
  (t) => [
    uniqueIndex('conversations_professional_client_uq').on(t.professionalId, t.clientId),
    index('conversations_professional_last_idx').on(t.professionalId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  'messages',
  {
    ...base,
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    direction: messageDirectionEnum('direction').notNull(),
    author: messageAuthorEnum('author').notNull(),
    kind: messageKindEnum('kind').notNull().default('text'),
    text: text('text'),
    transcription: text('transcription'),
    aiNote: text('ai_note'),
    providerMessageId: text('provider_message_id').unique(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const aiDecisions = pgTable(
  'ai_decisions',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    type: decisionTypeEnum('type').notNull(),
    question: text('question').notNull(),
    context: jsonb('context').$type<DecisionContext>().notNull(),
    options: jsonb('options').$type<DecisionOption[]>().notNull(),
    proposedAction: jsonb('proposed_action').$type<AgendaActionCall | null>(),
    status: decisionStatusEnum('status').notNull().default('pending'),
    deadlineAt: ts('deadline_at').notNull(),
    timeoutNotifiedAt: ts('timeout_notified_at'),
    resolvedVia: decisionViaEnum('resolved_via'),
    resolvedOption: text('resolved_option'),
    resolvedText: text('resolved_text'),
  },
  (t) => [index('ai_decisions_professional_status_idx').on(t.professionalId, t.status)],
);

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    ...base,
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    preference: jsonb('preference').$type<WaitlistPreference>().notNull(),
    optedInAt: ts('opted_in_at').notNull(),
    sourceMessageId: uuid('source_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    status: waitlistEntryStatusEnum('status').notNull().default('waiting'),
  },
  (t) => [index('waitlist_entries_professional_idx').on(t.professionalId, t.status, t.optedInAt)],
);

export const waitlistOffers = pgTable(
  'waitlist_offers',
  {
    ...base,
    entryId: uuid('entry_id')
      .notNull()
      .references(() => waitlistEntries.id, { onDelete: 'cascade' }),
    slotStartsAt: ts('slot_starts_at').notNull(),
    /** End of the freed interval (the next person is offered the same slot). */
    slotEndsAt: ts('slot_ends_at').notNull(),
    /** Services booked when the client accepts. */
    serviceIds: uuid('service_ids').array().notNull().default([]),
    expiresAt: ts('expires_at').notNull(),
    status: waitlistOfferStatusEnum('status').notNull().default('sent'),
  },
  (t) => [
    index('waitlist_offers_entry_idx').on(t.entryId),
    index('waitlist_offers_slot_idx').on(t.slotStartsAt, t.status),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    ...base,
    professionalId: uuid('professional_id').references(() => professionals.id, {
      onDelete: 'cascade',
    }),
    actor: actorEnum('actor').notNull(),
    action: text('action').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('audit_log_professional_idx').on(t.professionalId, t.createdAt)],
);

export const kitLeads = pgTable('kit_leads', {
  ...base,
  professionalId: uuid('professional_id')
    .notNull()
    .references(() => professionals.id, { onDelete: 'cascade' }),
  note: text('note'),
});

export const leads = pgTable('leads', {
  ...base,
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  profession: text('profession'),
  message: text('message'),
  source: text('source').notNull(),
});

export const accountDeletions = pgTable('account_deletions', {
  ...base,
  phoneHash: text('phone_hash').notNull(),
  requestedAt: ts('requested_at').notNull(),
  completedAt: ts('completed_at'),
  origin: accountDeletionOriginEnum('origin').notNull(),
});
