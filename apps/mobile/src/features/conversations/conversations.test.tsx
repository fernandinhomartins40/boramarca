import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { data } from '@/data';
import { mockConversations, mockMessages } from '@/data/conversations';
import { uid } from '@/data/mock/util';
import { ConversationScreen } from './ConversationScreen';
import { ConversationsScreen } from './ConversationsScreen';
import { listTime, nextLabel } from './format';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

jest.setTimeout(60_000);
afterEach(() => jest.restoreAllMocks());

const beatriz = uid(0x303); // audio + AI note
const carlos = uid(0x304); // taken over ("Com você")

it('formats times', () => {
  const today = new Date();
  today.setHours(16, 0, 0, 0);
  expect(nextLabel(today.toISOString())).toBe('Próximo: hoje às 16h');
  today.setHours(9, 30);
  expect(listTime(today.toISOString())).toBe('09:30');
  expect(listTime(null)).toBe('');
});

describe('Lista de conversas', () => {
  it('shows loading, then the error state', async () => {
    let fail!: (e: Error) => void;
    jest
      .spyOn(data.conversations, 'list')
      .mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    await render(<ConversationsScreen />);
    expect(screen.getByLabelText('Carregando as conversas')).toBeTruthy();
    fail(new Error('Sem conexão. Tente de novo.'));
    expect(await screen.findByText('Não deu para carregar')).toBeTruthy();
  });

  it('empty state', async () => {
    jest.spyOn(data.conversations, 'list').mockResolvedValue({ items: [], nextCursor: null });
    await render(<ConversationsScreen />);
    expect(await screen.findByText('Nenhuma conversa ainda')).toBeTruthy();
  });

  it('lists conversations with who is answering and filters by chip', async () => {
    await render(<ConversationsScreen />);
    expect(await screen.findByText('Beatriz Lima')).toBeTruthy();
    expect(screen.getAllByText('IA').length).toBeGreaterThan(1);
    expect(screen.getByText('Você')).toBeTruthy();
    const list = jest.spyOn(data.conversations, 'list');
    await fireEvent.press(screen.getByRole('button', { name: 'Com você' }));
    expect(await screen.findByText('Carlos Souza')).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith({ filter: 'human', search: undefined });
    expect(screen.queryByText('Beatriz Lima')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Carlos Souza/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/conversa/[id]',
      params: { id: carlos },
    });
  });
});

describe('Conversa', () => {
  it('shows the AI seal, the audio transcription and the AI note', async () => {
    await render(<ConversationScreen id={beatriz} />);
    expect(await screen.findByText('Beatriz Lima')).toBeTruthy();
    expect(screen.getAllByLabelText('Mensagem da IA').length).toBe(2);
    expect(screen.getByText('Pode sim, às quatro está ótimo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvir áudio' })).toBeTruthy();
    expect(screen.getByLabelText('Nota da IA: Pedido de horário identificado')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'IA respondendo' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Marcar horário' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/agendamento/novo',
      params: { clientId: mockConversations.find((c) => c.id === beatriz)!.clientId },
    });
  });

  it('switch off takes over, the banner gives it back to the AI', async () => {
    await render(<ConversationScreen id={beatriz} />);
    await fireEvent.press(await screen.findByRole('switch', { name: 'IA respondendo' }));
    expect(await screen.findByText('Você está respondendo esta conversa.')).toBeTruthy();
    expect(mockConversations.find((c) => c.id === beatriz)!.handler).toBe('human');
    await fireEvent.press(screen.getByRole('button', { name: /Devolver para a IA/ }));
    expect(mockConversations.find((c) => c.id === beatriz)!.handler).toBe('ai');
  });

  it('quick reply fills the field and sends as the professional', async () => {
    await render(<ConversationScreen id={carlos} />);
    expect(await screen.findByText('Você está respondendo esta conversa.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pode vir' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect((await screen.findAllByText('Pode vir')).length).toBe(2); // chip + bubble
    expect(mockMessages.get(carlos)!.at(-1)).toMatchObject({
      author: 'professional',
      text: 'Pode vir',
    });
  });

  it('error state', async () => {
    jest.spyOn(data.conversations, 'messages').mockRejectedValueOnce(new Error('Sem conexão.'));
    await render(<ConversationScreen id={beatriz} />);
    expect(await screen.findByText('Não deu para carregar')).toBeTruthy();
  });
});
