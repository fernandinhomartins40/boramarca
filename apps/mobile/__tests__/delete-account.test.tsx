import { fireEvent, render, screen } from '@testing-library/react-native';
import { data, DataError } from '@/data';
import { DeleteAccountFlow } from '@/features/account/DeleteAccountFlow';
import { useSession } from '@/features/auth/session';

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

const PHONE = '+5511987654321';

beforeEach(() => {
  useSession.setState({
    status: 'signedIn',
    phone: PHONE,
    tokens: {
      accessToken: 'a',
      refreshToken: 'r',
      accessTokenExpiresAt: new Date().toISOString(),
      refreshTokenExpiresAt: new Date().toISOString(),
    },
  });
});

afterEach(() => jest.restoreAllMocks());

it('explains, sends a delete_account code, calls DELETE /me and signs out', async () => {
  const requestOtp = jest.spyOn(data.auth, 'requestOtp');
  const deleteMe = jest.spyOn(data.account, 'deleteMe');
  await render(<DeleteAccountFlow />);

  expect(screen.getByText('Sua agenda, seus clientes e a lista de espera')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
  expect(requestOtp).toHaveBeenCalledWith({ phone: PHONE, purpose: 'delete_account' });

  await fireEvent.changeText(await screen.findByLabelText('Código de 6 dígitos'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Excluir minha conta' }));

  expect(deleteMe).toHaveBeenCalledWith({ code: '123456', origin: 'app' });
  expect(useSession.getState()).toMatchObject({ status: 'signedOut', phone: null, tokens: null });
});

it('wrong code shows the error inline and keeps the account', async () => {
  await render(<DeleteAccountFlow />);
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
  await fireEvent.changeText(await screen.findByLabelText('Código de 6 dígitos'), '000000');
  await fireEvent.press(screen.getByRole('button', { name: 'Excluir minha conta' }));

  expect(await screen.findByText('Código errado. Confira o SMS e tente de novo.')).toBeTruthy();
  expect(useSession.getState().status).toBe('signedIn');
});

it('owner with a team must confirm deleting the whole space', async () => {
  const deleteMe = jest
    .spyOn(data.account, 'deleteMe')
    .mockRejectedValueOnce(
      new DataError({ statusCode: 409, code: 'OWNER_HAS_TEAM', message: 'Você tem uma equipe.' }),
    );
  await render(<DeleteAccountFlow />);
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
  await fireEvent.changeText(await screen.findByLabelText('Código de 6 dígitos'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Excluir minha conta' }));

  await fireEvent.press(
    await screen.findByRole('checkbox', {
      name: 'Excluir também o espaço inteiro e as contas da equipe',
    }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Excluir minha conta' }));
  expect(deleteMe).toHaveBeenLastCalledWith({
    code: '123456',
    origin: 'app',
    deleteWholeSalon: true,
  });
  expect(useSession.getState().status).toBe('signedOut');
});
