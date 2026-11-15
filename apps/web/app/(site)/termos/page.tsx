import type { Metadata } from 'next';
import Link from 'next/link';
import { Plan, PLAN_LABELS } from '@boramarca/shared';
import { LegalPage } from '@/components/site/LegalPage';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Termos de uso',
  description:
    'Regras de uso do app Bora Marca, riscos da conexão com o WhatsApp, limites e planos.',
  alternates: { canonical: '/termos' },
};

export default function TermosPage() {
  return (
    <LegalPage
      title="Termos de uso"
      updated="14 de novembro de 2026"
      intro={
        <p>
          Estes termos valem para o app <strong>Bora Marca</strong> (Android e iPhone), o painel
          web, a skill da Alexa e o site. Ao criar uma conta, você concorda com eles e com a{' '}
          <Link href="/privacidade">Política de privacidade</Link>.
        </p>
      }
    >
      <h2>1. O que é a Bora Marca</h2>
      <p>
        Um assistente de agenda para profissionais que trabalham com hora marcada. Ele organiza a
        agenda, responde clientes pelo WhatsApp com ajuda de inteligência artificial, envia
        lembretes, oferece vagas para a lista de espera e anuncia pedidos por voz no Modo Balcão. As
        decisões que afetam a agenda de outro cliente são sempre do profissional.
      </p>

      <h2>2. Conta</h2>
      <ul>
        <li>Você precisa ter 18 anos ou mais e usar um número de celular que seja seu.</li>
        <li>
          Você entra com um código enviado ao celular. Não compartilhe esse código: quem tem o
          código entra na sua conta.
        </li>
        <li>
          Em espaços com equipe, o dono cadastra os profissionais e responde pelo uso que eles fazem
          do app.
        </li>
        <li>
          As informações do cadastro (serviços, preços, horários, endereço) precisam estar corretas,
          porque a IA usa esses dados para responder seus clientes.
        </li>
      </ul>

      <h2>3. Conexão com o WhatsApp e risco de bloqueio</h2>
      <p>
        O app conecta o seu número como um aparelho conectado, do mesmo jeito que o WhatsApp Web.{' '}
        <strong>Essa conexão não é a API oficial do WhatsApp</strong>, e a Bora Marca não é afiliada
        ao WhatsApp nem à Meta. Ao conectar seu número, você declara estar ciente de que:
      </p>
      <ul>
        <li>
          o WhatsApp pode limitar, suspender ou banir números que usam conexões não oficiais, e isso
          pode acontecer mesmo com todos os cuidados;
        </li>
        <li>
          a Bora Marca reduz esse risco (só responde a quem escreveu primeiro, limita a quantidade
          de mensagens, simula o tempo de digitação e não faz envio em massa), mas não tem como
          garantir que o número não será restringido;
        </li>
        <li>
          a Bora Marca não responde pela perda do número, de contatos ou de conversas causada por
          uma ação do WhatsApp.
        </li>
      </ul>

      <h2>4. Uso permitido</h2>
      <p>Você concorda em não usar a Bora Marca para:</p>
      <ul>
        <li>enviar propaganda, correntes ou mensagens para quem não pediu;</li>
        <li>tentar contornar os limites de envio ou usar o app para envio em massa;</li>
        <li>pedir ou guardar informação clínica de clientes nas conversas com a IA;</li>
        <li>enganar clientes, se passar por outra pessoa ou violar direitos de terceiros;</li>
        <li>tentar acessar dados de outros profissionais ou atacar o sistema.</li>
      </ul>
      <p>Se isso acontecer, podemos suspender ou encerrar a conta.</p>

      <h2>5. Seus clientes e os dados deles</h2>
      <p>
        Os dados dos seus clientes são seus: você é o controlador e a Bora Marca trata esses dados
        em seu nome, só para organizar seus atendimentos. Cabe a você informar seus clientes de que
        usa um assistente com IA para responder e marcar horários, e atender os pedidos deles sobre
        os próprios dados (podemos ajudar).
      </p>

      <h2>6. Inteligência artificial</h2>
      <ul>
        <li>
          A IA só faz sozinha o que você permitir nos ajustes. Mudanças no horário de outro cliente
          sempre passam por você e não podem ser liberadas. Com a IA pausada ou desligada, ou numa
          conversa que você assumiu, ela não manda nada ao cliente nem marca nada: você só recebe o
          aviso no app.
        </li>
        <li>
          Se você não responder a um pedido a tempo, a IA manda uma mensagem neutra ao cliente
          (&ldquo;Já te confirmo!&rdquo;) e não marca nada por conta própria (com a IA pausada ou
          com a conversa assumida por você, nem essa mensagem sai).
        </li>
        <li>
          A IA pode entender errado. Confira as conversas no app e assuma o atendimento quando
          precisar. Você é responsável pelas informações de serviços, preços e horários que ela
          repassa.
        </li>
        <li>Em contas de saúde, a IA trata só de horário, serviço, preço e endereço.</li>
      </ul>

      <h2>7. Voz, Modo Balcão e Alexa</h2>
      <p>
        No Android, o Modo Balcão pode escutar com a tela bloqueada, com uma notificação fixa
        avisando. No iPhone, funciona com o app aberto e a tela acesa; com o app fechado, os pedidos
        chegam por notificação. O reconhecimento de voz depende do aparelho, do ambiente e da
        conexão, e pode falhar. A integração com a Alexa é opcional e depende de serviços da Amazon
        e do Voice Monkey.
      </p>

      <h2>8. Planos</h2>
      <p>
        A Bora Marca é oferecida nos planos {Plan.options.map((p) => PLAN_LABELS[p]).join(', ')}. O
        plano da sua conta aparece no app e no painel. Valores, limites e forma de pagamento são
        informados antes da contratação; o app não faz cobrança dentro dele. Mudanças de preço são
        avisadas com pelo menos 30 dias de antecedência.
      </p>

      <h2>9. Disponibilidade e limites de responsabilidade</h2>
      <ul>
        <li>
          Trabalhamos para manter o serviço no ar, mas ele pode ficar fora em manutenções, quedas de
          provedores ou do WhatsApp. Quando a conexão com o WhatsApp cai, o app avisa e segura as
          mensagens até voltar.
        </li>
        <li>
          A Bora Marca não responde por lucros cessantes, atendimentos perdidos ou danos indiretos
          causados por falhas de terceiros (WhatsApp, operadoras, provedores de IA, lojas de
          aplicativos) ou por informações erradas no seu cadastro.
        </li>
        <li>Nada nestes termos limita direitos que a lei garante ao consumidor.</li>
      </ul>

      <h2>10. Encerramento</h2>
      <p>
        Você pode excluir sua conta a qualquer momento pelo app ou pela página{' '}
        <Link href="/excluir-conta">Excluir conta</Link>. Podemos encerrar contas que violem estes
        termos, avisando antes sempre que possível.
      </p>

      <h2>11. Propriedade intelectual</h2>
      <p>
        A marca, o app e o site são da Bora Marca. Você mantém os direitos sobre o conteúdo que
        cadastra e nos autoriza a usá-lo só para prestar o serviço.
      </p>

      <h2>12. Mudanças nos termos</h2>
      <p>
        Quando estes termos mudarem, atualizamos a data no topo e avisamos no app se a mudança for
        relevante. Continuar usando depois do aviso significa concordar com a nova versão.
      </p>

      <h2>13. Lei aplicável e contato</h2>
      <p>
        Estes termos seguem as leis do Brasil. Dúvidas:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> ou a página de{' '}
        <Link href="/contato">contato</Link>.
      </p>
    </LegalPage>
  );
}
