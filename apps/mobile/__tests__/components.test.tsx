import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  BigChoice,
  Button,
  Logo,
  StatusPill,
  Switch,
  TimeSlot,
  VoiceOrb,
  initials,
  pillForAppointment,
} from '@/components';
import { resolveScheme, themes } from '@/theme';
import { colors, touchTarget } from '@boramarca/shared';

it('Button calls onPress', async () => {
  const onPress = jest.fn();
  await render(<Button label="Começar" onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Começar' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('Button blocks presses when disabled', async () => {
  const blocked = jest.fn();
  await render(<Button label="Conectar" onPress={blocked} disabled />);
  await fireEvent.press(screen.getByRole('button', { name: 'Conectar' }));
  expect(blocked).not.toHaveBeenCalled();
});

it('BigChoice has Sim and Não of at least 96 dp', async () => {
  const onYes = jest.fn();
  const onNo = jest.fn();
  await render(<BigChoice onYes={onYes} onNo={onNo} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sim' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Não' }));
  expect(onYes).toHaveBeenCalled();
  expect(onNo).toHaveBeenCalled();
  const style = screen.getByRole('button', { name: 'Sim' }).props.style;
  const flat = Object.assign({}, ...[style].flat(3).filter(Boolean));
  expect(flat.minHeight).toBeGreaterThanOrEqual(touchTarget.bigChoice);
});

it('StatusPill "Confirmado" is lima with grafite text', async () => {
  await render(<StatusPill status="confirmado" />);
  const text = screen.getByText('Confirmado');
  const flat = Object.assign({}, ...[text.props.style].flat(3).filter(Boolean));
  expect(flat.color).toBe(colors.light.onSuccess);
  expect(pillForAppointment('scheduled', true)).toBe('encaixe');
  expect(pillForAppointment('no_show')).toBe('faltou');
});

it('Switch toggles and exposes its state', async () => {
  const onChange = jest.fn();
  await render(<Switch value={false} onValueChange={onChange} accessibilityLabel="IA atendendo" />);
  const sw = screen.getByRole('switch', { name: 'IA atendendo' });
  expect(sw.props.accessibilityState.checked).toBe(false);
  await fireEvent.press(sw);
  expect(onChange).toHaveBeenCalledWith(true);
});

it('renders Logo, TimeSlot and VoiceOrb', async () => {
  await render(
    <>
      <Logo />
      <TimeSlot
        time="16:00"
        state="free"
        title="Livre — toque para marcar"
        onPress={() => undefined}
      />
      <TimeSlot time="17:00" state="freed" title="Carlos" subtitle="Cancelou há 3 min" />
      <VoiceOrb state="ouvindo" />
    </>,
  );
  expect(screen.getByLabelText('Bora Marca')).toBeTruthy();
  expect(screen.getByRole('button', { name: '16:00, Livre — toque para marcar' })).toBeTruthy();
  expect(screen.getByText('Cancelou há 3 min')).toBeTruthy();
  expect(screen.getByLabelText('Ouvindo')).toBeTruthy();
});

it('helpers: initials and theme resolution', () => {
  expect(initials('Ana Paula')).toBe('AP');
  expect(initials('Rafael')).toBe('R');
  expect(resolveScheme(null, 'system', 'dark')).toBe('dark');
  expect(resolveScheme(null, 'light', 'dark')).toBe('light');
  expect(resolveScheme('dark', 'light', 'light')).toBe('dark');
  expect(themes.dark.colors.tabActive).toBe(colors.dark.accent);
});
