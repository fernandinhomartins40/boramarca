import {
  AgendaResponse,
  ClientListResponse,
  ConversationListResponse,
  DecisionListResponse,
  MeResponse,
  MessageListResponse,
  WaitlistListResponse,
} from '@boramarca/shared';
import { createData, mockData, resolveDataSource } from '@/data';
import { today } from '@/data/mock/util';

describe('data source selection', () => {
  it('uses api only when EXPO_PUBLIC_DATA_SOURCE=api', () => {
    expect(resolveDataSource('api')).toBe('api');
    expect(resolveDataSource('mock')).toBe('mock');
    expect(resolveDataSource(undefined)).toBe('mock');
    expect(resolveDataSource('anything')).toBe('mock');
  });

  it('returns the mock layer for mock and the stub for api', async () => {
    expect(createData('mock')).toBe(mockData);
    await expect(createData('api').agenda.getDay(today())).rejects.toThrow(
      'api.agenda.getDay: não implementado',
    );
  });
});

describe('mock data follows the shared contracts', () => {
  it('today matches reference 04-agenda (8 atendimentos, 2 vagas, R$ 1.200)', async () => {
    const day = AgendaResponse.parse(await mockData.agenda.getDay(today()));
    // On weekends there are no working hours: the demo day only holds on weekdays.
    if (day.workingHours) {
      expect(day.summary).toEqual({
        appointmentsCount: 8,
        freeSlotsCount: 2,
        expectedRevenueCents: 120000,
      });
    }
    const now = day.appointments.find((a) => a.status === 'in_service');
    expect(now?.clientName).toBe('Ana Paula');
    expect(day.appointments.find((a) => a.status === 'cancelled')?.clientName).toBe('Carlos Souza');
  });

  it('every domain list parses with its schema', async () => {
    MeResponse.parse(await mockData.profile.getMe());
    ClientListResponse.parse(await mockData.clients.list());
    WaitlistListResponse.parse(await mockData.waitlist.list());
    const pending = DecisionListResponse.parse(await mockData.decisions.list('pending'));
    expect(new Set(pending.items.map((d) => d.type))).toEqual(
      new Set(['encaixe', 'novo_horario', 'remarcar', 'atraso', 'duvida']),
    );
    const convs = ConversationListResponse.parse(await mockData.conversations.list());
    expect(convs.items.length).toBeGreaterThanOrEqual(6);
    MessageListResponse.parse(await mockData.conversations.messages(convs.items[0]!.id));
  });

  it('answering the Beatriz fit-in books her at 16:00', async () => {
    const { items } = await mockData.decisions.list('pending');
    const beatriz = items.find((d) => d.type === 'encaixe')!;
    const res = await mockData.decisions.answer(beatriz.id, { optionId: 'sim', via: 'app' });
    expect(res.decision.status).toBe('resolved');
    expect(res.appointment?.clientName).toBe('Beatriz Lima');
    await expect(
      mockData.decisions.answer(beatriz.id, { optionId: 'sim', via: 'app' }),
    ).rejects.toMatchObject({ code: 'ALREADY_RESOLVED' });
  });

  it('login accepts only 123456', async () => {
    await expect(
      mockData.auth.verifyOtp({ phone: '+5511912345678', code: '000000' }),
    ).rejects.toMatchObject({ code: 'INVALID_CODE' });
    const ok = await mockData.auth.verifyOtp({ phone: '+5511912345678', code: '123456' });
    expect(ok.isNewUser).toBe(true);
  });
});
