import { render, screen } from '@testing-library/react-native';
import Index from '../app/index';

it('renders the provisional home', async () => {
  await render(<Index />);
  expect(await screen.findByText('Bora Marca')).toBeTruthy();
});
