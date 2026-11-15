import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { data } from '@/data';
import { mockConversations } from '@/data/conversations';
import { mockDecisions } from '@/data/decisions';
import { uid } from '@/data/mock/util';
import { DecisionsScreen } from './DecisionsScreen';
import { deadline, deadlineLabel, resolutionSummary, timeAgo, yesNoPair } from './format';
import { handleDecisionAction, onDecisionsChanged } from './index';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2 },
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async () => null),
  setNotificationChannelAsync: jest.fn(async () => null),
}));

jest.setTimeout(60_000);
afterEach(() => jest.restoreAllMocks());

describe('handleDecisionAction', () => {
  it('answers through the data layer with the channel and announces the change', async () => {
    const answer = jest.spyOn(data.decisions, 'answer');
    const changed = jest.fn();
    const off = onDecisionsChanged(changed);
    const r = await handleDecisionAction(uid(0x504), { optionId: 'empurrar' }, 'voice');
    off();
    expect(answer).toHaveBeenCalledWith(uid(0x504), { optionId: 'empurrar', via: 'voice' });
    expect(r.decision).toMatchObject({ status: 'resolved', resolvedVia: 'voice' });
    expect(r.spokenConfirmation).toBe('Pronto. Já avisei Diego.');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('accepts free text and rejects answering twice', async () => {
    const r = await handleDecisionAction(
      uid(0x505),
      { text: 'pode, mas marca daqui 15 minutos' },
      'app',
    );
    expect(r.decision.resolvedText).toBe('pode, mas marca daqui 15 minutos');
    await expect(handleDecisionAction(uid(0x505), { optionId: 'sim' }, 'app')).rejects.toThrow(
      'Essa decisão já foi resolvida',
    );
  });
});

describe('format', () => {
  const now = new Date('2026-11-14T14:10:00Z');
  it('time ago and deadline', () => {
    expect(timeAgo('2026-11-14T14:08:00Z', now)).toBe('há 2 min');
    expect(timeAgo('2026-11-14T14:09:40Z', now)).toBe('agora');
    const dl = deadline(
      { createdAt: '2026-11-14T14:08:00Z', deadlineAt: '2026-11-14T14:18:00Z' },
      now,
    );
    expect(dl).toEqual({ fraction: 0.8, minutesLeft: 8, overdue: false });
    expect(deadlineLabel(dl)).toBe('Responder em até 8 min');
    expect(
      deadline({ createdAt: '2026-11-14T13:00:00Z', deadlineAt: '2026-11-14T13:10:00Z' }, now),
    ).toMatchObject({ fraction: 0, overdue: true });
  });
  it('yes/no pair and history summary', () => {
    expect(yesNoPair([{ id: 'sim' }, { id: 'nao' }])).toEqual({
      yes: { id: 'sim' },
      no: { id: 'nao' },
    });
    expect(yesNoPair([{ id: '10h' }, { id: '16h' }, { id: 'nao' }])).toBeNull();
    const expired = mockDecisions.find((d) => d.status === 'expired')!;
    expect(resolutionSummary(expired).subtitle).toBe('Expirou — IA avisou o cliente');
    const voice = mockDecisions.find((d) => d.resolvedVia === 'voice' && d.id === uid(0x506))!;
    expect(resolutionSummary(voice)).toMatchObject({ title: 'Lucas: Sim', clientNotified: true });
    expect(resolutionSummary(voice).subtitle).toMatch(/^Você, por voz · \d\d:\d\d$/);
  });
});

describe('Aba Decisões', () => {
  it('shows loading, then the error state with retry', async () => {
    let fail!: (e: Error) => void;
    jest
      .spyOn(data.decisions, 'list')
      .mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    await render(<DecisionsScreen />);
    expect(screen.getByLabelText('Carregando as decisões')).toBeTruthy();
    fail(new Error('Sem conexão. Tente de novo.'));
    expect(await screen.findByText('Não deu para carregar')).toBeTruthy();
  });

  it('empty queue: "Nada esperando você"', async () => {
    jest.spyOn(data.decisions, 'list').mockResolvedValue({ items: [] });
    await render(<DecisionsScreen />);
    expect(await screen.findByText('Nada esperando você. Bom trabalho!')).toBeTruthy();
  });

  it('pending cards: context, deadline, option answer with preview, permission explained first', async () => {
    await render(<DecisionsScreen />);
    const question = await screen.findByText('O horário das 16h vagou. Posso marcar a Beatriz?');
    expect(question).toBeTruthy();
    expect(screen.getByText('Ela pediu para vir hoje à tarde.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Pendentes \(\d\)$/ })).toBeTruthy();
    expect(screen.getAllByText(/^Responder em até \d+ min$/).length).toBeGreaterThan(0);
    // permission: explanation card, the system prompt only on "Ativar"
    expect(await screen.findByText('Responder pela notificação')).toBeTruthy();

    // first card = most urgent (Juliana)
    await fireEvent.press(screen.getAllByRole('button', { name: 'Ver conversa' })[0]!);
    expect(screen.getByText(/^Juliana: Quero agendar um retorno/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Sim, pode marcar' }));
    expect(await screen.findByText('Mensagem para o cliente')).toBeTruthy();
    expect(
      screen.getByText('Olá, Beatriz! Seu agendamento foi confirmado. Nos vemos lá!'),
    ).toBeTruthy();
    expect(mockDecisions.find((d) => d.id === uid(0x501))).toMatchObject({
      status: 'resolved',
      resolvedVia: 'app',
    });
  });

  it('"Deixa que eu respondo" hands the conversation over and opens it', async () => {
    // most urgent first: Juliana (2 min) is the first card left
    const pending = mockDecisions.find((d) => d.id === uid(0x503))!;
    await render(<DecisionsScreen />);
    await screen.findByText(pending.question);
    const take = screen.getAllByRole('button', {
      name: 'Deixa que eu respondo: a IA para nesta conversa',
    });
    await fireEvent.press(take[0]!);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/conversa/[id]',
      params: { id: pending.conversationId },
    });
    expect(mockConversations.find((c) => c.id === pending.conversationId)?.handler).toBe('human');
  });

  it('free text answer', async () => {
    await render(<DecisionsScreen />);
    const card = await screen.findByText('Pode passar das 15h para as 17h?');
    expect(card).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Responder outra coisa' })[0]!);
    await fireEvent.changeText(screen.getByLabelText('Sua resposta'), 'Oferece as 16h');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByText('Mensagem para o cliente')).toBeTruthy();
  });

  it('history shows how each decision was resolved', async () => {
    await render(<DecisionsScreen />);
    await fireEvent.press(await screen.findByRole('tab', { name: 'Resolvidas' }));
    expect(await screen.findByText('Histórico das decisões que você já resolveu.')).toBeTruthy();
    expect(screen.getByText('Expirou — IA avisou o cliente')).toBeTruthy();
    const lucas = screen.getByText('Lucas: Sim');
    expect(lucas).toBeTruthy();
    expect(screen.getAllByText('Cliente avisado').length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText(/^Lucas: Sim\./)).getByText(/Você, por voz/)).toBeTruthy();
  });
});
