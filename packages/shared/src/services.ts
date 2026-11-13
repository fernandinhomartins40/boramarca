import { z } from 'zod';
import { Cents, EntityBase, Id } from './common';
import type { Profession } from './salon';

export const Service = EntityBase.extend({
  professionalId: Id,
  name: z.string().trim().min(1).max(80),
  durationMin: z.number().int().min(5).max(720),
  priceCents: Cents,
  position: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type Service = z.infer<typeof Service>;

// ---- CRUD /services
export const ServiceCreate = z.object({
  name: z.string().trim().min(1).max(80),
  durationMin: z.number().int().min(5).max(720),
  priceCents: Cents,
  position: z.number().int().nonnegative().optional(),
  active: z.boolean().default(true),
});
export type ServiceCreate = z.infer<typeof ServiceCreate>;

export const ServiceUpdate = ServiceCreate.partial();
export type ServiceUpdate = z.infer<typeof ServiceUpdate>;

export const ServiceListQuery = z.object({
  includeInactive: z.coerce.boolean().default(false),
});
export type ServiceListQuery = z.infer<typeof ServiceListQuery>;

export const ServiceListResponse = z.object({ items: z.array(Service) });
export type ServiceListResponse = z.infer<typeof ServiceListResponse>;

/** Drag to reorder: full ordered list of ids. */
export const ServiceReorderBody = z.object({ ids: z.array(Id).min(1) });
export type ServiceReorderBody = z.infer<typeof ServiceReorderBody>;

export interface SuggestedService {
  name: string;
  durationMin: number;
  priceCents: number;
}

/**
 * Pre-filled services for the quick sign-up, by profession (plan section 3).
 * Prices are editable starting points, not market data.
 */
export const SUGGESTED_SERVICES: Record<Profession, readonly SuggestedService[]> = {
  barbeiro: [
    { name: 'Corte', durationMin: 30, priceCents: 4000 },
    { name: 'Barba', durationMin: 30, priceCents: 3000 },
    { name: 'Corte + Barba', durationMin: 60, priceCents: 7000 },
    { name: 'Pezinho', durationMin: 15, priceCents: 1500 },
  ],
  cabeleireiro: [
    { name: 'Corte feminino', durationMin: 60, priceCents: 8000 },
    { name: 'Escova', durationMin: 45, priceCents: 5000 },
    { name: 'Coloração', durationMin: 120, priceCents: 15000 },
    { name: 'Hidratação', durationMin: 60, priceCents: 7000 },
  ],
  manicure: [
    { name: 'Mão', durationMin: 45, priceCents: 3500 },
    { name: 'Pé', durationMin: 45, priceCents: 4000 },
    { name: 'Pé e mão', durationMin: 90, priceCents: 7000 },
    { name: 'Alongamento em gel', durationMin: 120, priceCents: 15000 },
  ],
  esteticista: [
    { name: 'Limpeza de pele', durationMin: 60, priceCents: 12000 },
    { name: 'Design de sobrancelha', durationMin: 30, priceCents: 4500 },
    { name: 'Depilação', durationMin: 45, priceCents: 6000 },
  ],
  fisioterapeuta: [
    { name: 'Sessão de fisioterapia', durationMin: 50, priceCents: 15000 },
    { name: 'Avaliação', durationMin: 60, priceCents: 18000 },
    { name: 'Pilates', durationMin: 50, priceCents: 9000 },
  ],
  psicologo: [
    { name: 'Sessão', durationMin: 50, priceCents: 20000 },
    { name: 'Primeira consulta', durationMin: 60, priceCents: 20000 },
  ],
  dentista: [
    { name: 'Consulta', durationMin: 30, priceCents: 15000 },
    { name: 'Limpeza', durationMin: 45, priceCents: 20000 },
    { name: 'Avaliação', durationMin: 30, priceCents: 10000 },
  ],
  professor_instrutor: [
    { name: 'Aula individual', durationMin: 60, priceCents: 10000 },
    { name: 'Aula experimental', durationMin: 30, priceCents: 0 },
  ],
  outro: [],
};
