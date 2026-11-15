import type { Metadata } from 'next';
import Link from 'next/link';
import { DeleteAccountFlow } from '@/components/site/DeleteAccountFlow';
import { container } from '@/components/site/ui';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Excluir conta',
  description:
    'Apague sua conta do app Bora Marca e os dados dos seus clientes, sem precisar do app instalado.',
  alternates: { canonical: '/excluir-conta' },
};

export default function ExcluirContaPage() {
  return (
    <main id="conteudo" className={`${container} py-xxxl`}>
      <div className="grid gap-xxl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="legal">
          <h1 className="text-display text-text">Excluir sua conta Bora Marca</h1>
          <p>
            Esta página apaga a conta do app <strong>Bora Marca</strong> (Android e iPhone) sem
            precisar do app instalado. No app, o mesmo pedido fica em Ajustes → Excluir conta.
          </p>

          <h2>Como funciona</h2>
          <ul>
            <li>Informe o celular que você usa para entrar no app.</li>
            <li>Digite o código que enviamos para provar que o número é seu.</li>
            <li>Confirme a exclusão e digite o segundo código, que só serve para excluir.</li>
          </ul>
          <p>
            A exclusão acontece na hora. Se você for dono de um espaço com outros profissionais,
            escolhe antes se passa o espaço para alguém da equipe ou se apaga o espaço inteiro.
          </p>

          <h2>O que é apagado</h2>
          <ul>
            <li>
              Seu cadastro: nome, telefone, profissões, endereço, ajustes da IA e do Modo Balcão.
            </li>
            <li>
              Os dados dos seus clientes: nomes, telefones, preferências, agenda, histórico de
              atendimentos e lista de espera.
            </li>
            <li>Conversas, mensagens, áudios transcritos e pedidos de decisão.</li>
            <li>
              A conexão com o WhatsApp: a sessão é desconectada e apagada. Lembretes e mensagens
              agendadas são cancelados.
            </li>
            <li>Aparelhos cadastrados para notificação e o vínculo com a Alexa.</li>
          </ul>

          <h2>O que é mantido</h2>
          <ul>
            <li>
              Só um registro mínimo de que o pedido foi atendido: um código irreversível gerado a
              partir do telefone (não dá para recuperar o número), a data do pedido, a data da
              conclusão e se veio do app ou deste site. Ele serve para comprovar o atendimento do
              pedido, como pede a LGPD.
            </li>
            <li>
              As mensagens que já estão no seu WhatsApp e no dos seus clientes continuam nos
              aparelhos: elas pertencem ao WhatsApp, não à Bora Marca.
            </li>
            <li>
              Cópias de segurança do banco podem conter esses dados até serem substituídas no ciclo
              de rotação, em até 30 dias. Elas não são usadas para restaurar contas apagadas.
            </li>
          </ul>

          <p>
            Não consegue receber o código? Escreva para{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> pelo e-mail ou pelo{' '}
            <Link href="/contato">formulário de contato</Link>. Mais detalhes na{' '}
            <Link href="/privacidade#exclusao">Política de privacidade</Link>.
          </p>
        </div>
        <div className="lg:pt-xxxl">
          <DeleteAccountFlow />
        </div>
      </div>
    </main>
  );
}
