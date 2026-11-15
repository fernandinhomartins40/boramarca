import { ClientsScreen } from '@/features/clients/ClientsScreen';

/** Deep link to the waitlist: the Clientes screen opened on the "Lista de espera" segment. */
export default function ListaDeEsperaScreen() {
  return <ClientsScreen initialTab="espera" />;
}
