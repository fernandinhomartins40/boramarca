import { fireEvent, render, screen } from '@testing-library/react-native';
import type { MeResponse } from '@boramarca/shared';
import { data } from '@/data';
import { professional, salon } from '@/data/mock/fixtures';
import { EmailSection } from '@/features/account/EmailSection';

afterEach(() => jest.restoreAllMocks());

const me = (email: string | null, emailVerifiedAt: string | null): MeResponse => ({
  professional: { ...professional, email, emailVerifiedAt },
  salon,
});

it('saves a new e-mail (trimmed, lowercased) and then shows "aguardando confirmação"', async () => {
  const pending = me('ana@exemplo.com', null);
  const update = jest.spyOn(data.profile, 'updateMe').mockResolvedValue(pending);
  const onChange = jest.fn();
  const view = await render(<EmailSection me={me(null, null)} onChange={onChange} />);

  await fireEvent.changeText(screen.getByLabelText('Seu e-mail'), '  Ana@Exemplo.com ');
  await fireEvent.press(screen.getByRole('button', { name: 'Salvar e-mail' }));
  expect(update).toHaveBeenCalledWith({ email: 'ana@exemplo.com' });
  expect(onChange).toHaveBeenCalledWith(pending);

  await view.rerender(<EmailSection me={pending} onChange={onChange} />);
  expect(screen.getByText('Aguardando confirmação')).toBeTruthy();
});

it('pending: resends the link', async () => {
  const resend = jest.spyOn(data.profile, 'resendEmailConfirmation').mockResolvedValue();
  await render(<EmailSection me={me('ana@exemplo.com', null)} onChange={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Reenviar link' }));
  expect(resend).toHaveBeenCalled();
});

it('confirmed: shows "Confirmado" and no resend', async () => {
  await render(
    <EmailSection me={me('ana@exemplo.com', '2030-01-01T00:00:00.000Z')} onChange={jest.fn()} />,
  );
  expect(screen.getByText('Confirmado')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reenviar link' })).toBeNull();
});
