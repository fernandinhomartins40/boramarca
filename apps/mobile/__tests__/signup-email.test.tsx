import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { data } from '@/data';
import CreateAccountScreen from '../app/(auth)/criar-conta';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

afterEach(() => jest.restoreAllMocks());

it('free sign-up: checks the fields, sends the code by e-mail and opens the code screen', async () => {
  const request = jest.spyOn(data.auth, 'requestSignup');
  await render(<CreateAccountScreen />);
  const submit = screen.getByRole('button', { name: 'Receber código por e-mail' });
  await fireEvent.press(submit);
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByText('Escolha sua profissão.')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Seu nome'), 'Joana');
  await fireEvent.changeText(screen.getByLabelText('Nome do seu negócio'), 'Studio Joana');
  await fireEvent.press(screen.getByText('Manicure'));
  await fireEvent.changeText(screen.getByLabelText('Celular (WhatsApp)'), '11912345678');
  await fireEvent.changeText(screen.getByLabelText('E-mail'), ' Joana@Exemplo.com');
  await fireEvent.press(submit);
  const body = {
    name: 'Joana',
    salonName: 'Studio Joana',
    profession: 'manicure',
    phone: '+5511912345678',
    email: 'joana@exemplo.com',
  };
  expect(request).toHaveBeenCalledWith(body);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/codigo',
    params: { via: 'signup', masked: 'j***@exemplo.com', retry: '60', ...body },
  });
});
