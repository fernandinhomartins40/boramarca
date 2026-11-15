import { fireEvent, render, screen } from '@testing-library/react-native';
import { addDays, format, nextMonday } from 'date-fns';
import { data } from '@/data';
import { ids } from '@/data/mock/fixtures';
import { uid } from '@/data/mock/util';
import { AgendaScreen } from './AgendaScreen';
import { AppointmentDetailScreen } from './AppointmentDetailScreen';
import { NewAppointmentScreen } from './NewAppointmentScreen';
import { ClientsScreen } from '@/features/clients/ClientsScreen';
import { ClientProfileScreen } from '@/features/clients/ClientProfileScreen';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: () => true,
  },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

jest.setTimeout(30_000);
afterEach(() => jest.restoreAllMocks());

describe('Agenda do dia', () => {
  it('shows the reference day: Agora, summary, decision and timeline', async () => {
    await render(<AgendaScreen />);
    expect(await screen.findByText('Agora · Ana Paula')).toBeTruthy();
    expect(screen.getByText('Marina, seu dia está assim')).toBeTruthy();
    expect(screen.getByText('8 atendimentos')).toBeTruthy();
    // 2 on weekdays; the demo week has no weekend hours
    expect(screen.getByText(/^\d+ vagas?$/)).toBeTruthy();
    expect(screen.getByText('R$ 1.200')).toBeTruthy();
    expect(
      await screen.findByText('O horário das 16h vagou. Posso marcar a Beatriz?'),
    ).toBeTruthy();
    expect(screen.getAllByText('Diego Martins').length).toBeGreaterThan(0);
  });

  it('empty day invites to tell the waitlist', async () => {
    jest.spyOn(data.agenda, 'getDay').mockResolvedValue({
      date: format(new Date(), 'yyyy-MM-dd'),
      timezone: 'America/Sao_Paulo',
      workingHours: null,
      timeOff: [],
      appointments: [],
      summary: { appointmentsCount: 0, freeSlotsCount: 0, expectedRevenueCents: 0 },
    });
    await render(<AgendaScreen />);
    expect(await screen.findByText('Você não atende nesse dia.')).toBeTruthy();
    expect(screen.getByText('0 atendimentos')).toBeTruthy();
    expect(screen.getByText('Livre pelo resto do dia')).toBeTruthy();
  });

  it('shows loading, then the error state with retry', async () => {
    let fail!: (e: Error) => void;
    jest
      .spyOn(data.agenda, 'getDay')
      .mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    await render(<AgendaScreen />);
    expect(screen.getByLabelText('Carregando a agenda')).toBeTruthy();
    fail(new Error('Sem conexão'));
    expect(await screen.findByText('Não deu para carregar')).toBeTruthy();
  });
});

describe('Agendamento', () => {
  it('detail shows the history and "Cliente chegou" moves to em atendimento', async () => {
    await render(<AppointmentDetailScreen id={uid(0x207)} />);
    expect(await screen.findByText('Rafael Almeida')).toBeTruthy();
    expect(screen.getByText('Você confirmou por voz')).toBeTruthy();
    expect(screen.getByText('Marcado pela IA via WhatsApp')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cliente chegou' }));
    expect(await screen.findByText('Em atendimento')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Atendimento concluído' })).toBeTruthy();
  });

  it('new appointment: client, service, free time, preview of the message, then books', async () => {
    const day = format(addDays(nextMonday(new Date()), 7), 'yyyy-MM-dd');
    const create = jest.spyOn(data.agenda, 'create');
    await render(<NewAppointmentScreen date={day} />);
    await fireEvent.changeText(await screen.findByLabelText('Buscar cliente'), 'beatriz');
    await fireEvent.press(await screen.findByRole('button', { name: /^Beatriz Lima/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Sessão de fisioterapia/ }));
    await fireEvent.press(await screen.findByText('09:00'));
    expect(
      screen.getByText(/Olá, Beatriz! Seu agendamento de sessão de fisioterapia está confirmado/),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Marcar e avisar no WhatsApp' }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: ids.client.beatriz,
        serviceIds: [ids.service.sessao],
        notifyClient: true,
        messageText: expect.stringContaining('às 9h'),
      }),
    );
  });
});

describe('Clientes e lista de espera', () => {
  it('lists clients with tags and switches to the waitlist with the rule sentence', async () => {
    await render(<ClientsScreen />);
    expect(await screen.findByText('Rafael Almeida', {}, { timeout: 5000 })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Buscar cliente'), 'ferreira');
    expect(await screen.findByText('Sumido há 45 dias')).toBeTruthy();
    expect(screen.getByText('Falta muito')).toBeTruthy();
    expect(screen.queryByText('Rafael Almeida')).toBeNull();
    await fireEvent.press(await screen.findByRole('tab', { name: 'Lista de espera (3)' }));
    expect(await screen.findByText('Beatriz Lima')).toBeTruthy();
    expect(screen.getByText(/Qualquer dia à tarde/)).toBeTruthy();
    expect(screen.getByText('10 minutos')).toBeTruthy();
  });

  it('client profile shows numbers, preferences and history', async () => {
    await render(<ClientProfileScreen id={ids.client.anaPaula} />);
    expect(await screen.findByText('Vem a cada 21 dias')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Prefere o fim da tarde')).toBeTruthy();
    expect(screen.getByText('(11) 98877-6655')).toBeTruthy();
  });
});
