import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/site/LegalPage';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description:
    'Quais dados a Bora Marca trata, para quê, com quem compartilha, por quanto tempo guarda e como você exerce seus direitos.',
  alternates: { canonical: '/privacidade' },
};

const Mail = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

export default function PrivacidadePage() {
  return (
    <LegalPage
      title="Política de privacidade"
      updated="14 de novembro de 2026"
      intro={
        <p>
          Esta política explica como o app e o site <strong>Bora Marca</strong> tratam dados
          pessoais, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). Ela vale
          para o app no Android e no iPhone, para o painel web, para a skill da Alexa e para o site
          boramarca.com.br.
        </p>
      }
    >
      <h2>1. Quem é responsável pelos dados</h2>
      <p>
        A Bora Marca é a <strong>controladora</strong> dos dados de quem usa o app (o profissional)
        e de quem preenche o formulário do site. Para os dados dos clientes do profissional, quem
        decide como eles são usados é o próprio profissional (controlador); a Bora Marca trata esses
        dados em nome dele, como <strong>operadora</strong>, só para organizar a agenda e o
        atendimento dele.
      </p>

      <h2>2. Quais dados tratamos</h2>
      <h3>Do profissional</h3>
      <ul>
        <li>Telefone celular, usado para entrar no app por código.</li>
        <li>
          Nome, profissões, nome e endereço do espaço, serviços (duração e preço), horários de
          atendimento, folgas e plano contratado.
        </li>
        <li>
          Ajustes do app: o que a IA pode fazer sozinha, tom das mensagens, lembretes, horário de
          silêncio e velocidade da voz.
        </li>
        <li>
          Identificador do aparelho para notificações (token de notificação e se é Android ou
          iPhone).
        </li>
        <li>
          Em espaços com equipe, o dono vê a agenda, os clientes e os resultados dos profissionais
          do espaço.
        </li>
      </ul>
      <h3>Dos clientes do profissional</h3>
      <ul>
        <li>Nome e telefone de WhatsApp de quem escreve para o profissional.</li>
        <li>
          Mensagens trocadas com o número conectado, em texto e em áudio, e a transcrição dos
          áudios.
        </li>
        <li>
          Agendamentos, serviços, histórico de atendimentos, faltas, preferências anotadas e
          participação na lista de espera (só para quem pediu para entrar nela).
        </li>
      </ul>
      <h3>Do site</h3>
      <ul>
        <li>
          No formulário de contato: nome, WhatsApp, profissão e mensagem, se você escrever uma.
        </li>
        <li>
          Registros técnicos dos servidores (data, hora, endereço IP e página acessada), usados para
          segurança e para limitar abusos. Esses registros não guardam o conteúdo das mensagens nem
          telefones.
        </li>
      </ul>
      <p>
        Não usamos cookies de publicidade, não rastreamos você entre apps ou sites e não usamos
        identificador de publicidade.
      </p>

      <h2>3. Para que usamos os dados</h2>
      <ul>
        <li>
          <strong>Prestar o serviço</strong> (execução de contrato): mostrar a agenda, responder
          clientes pelo WhatsApp, enviar lembretes, oferecer vagas da lista de espera, anunciar
          pedidos no Modo Balcão e gerar relatórios do espaço.
        </li>
        <li>
          <strong>Entrar na conta</strong> com código enviado por SMS ao seu celular.
        </li>
        <li>
          <strong>Segurança e prevenção de abuso</strong> (legítimo interesse): limitar envios,
          bloquear robôs no site e investigar falhas.
        </li>
        <li>
          <strong>Responder contatos do site</strong> (legítimo interesse ou procedimentos
          preliminares a um contrato).
        </li>
        <li>
          <strong>Cumprir obrigações legais</strong> e comprovar o atendimento de pedidos de
          titulares.
        </li>
      </ul>
      <p>Não vendemos dados pessoais e não os usamos para publicidade.</p>

      <h2>4. Inteligência artificial</h2>
      <p>
        A IA da Bora Marca lê as mensagens dos clientes para entender o pedido (horário, remarcação,
        cancelamento, preço, endereço) e sugerir ou executar a ação que o profissional permitiu. Ela
        não escreve direto na agenda: cada ação passa pelas regras do sistema, e qualquer mudança no
        horário de outro cliente sempre vira uma pergunta para o profissional.
      </p>
      <p>
        Para a IA vai só o mínimo: o primeiro nome do cliente, as mensagens recentes da conversa, a
        agenda do dia resumida e a lista de serviços.{' '}
        <strong>O telefone do cliente nunca é enviado à IA.</strong>
      </p>
      <h3>Contas de saúde</h3>
      <p>
        Para psicologia, fisioterapia, odontologia e outras áreas de saúde, o fato de alguém ter
        consulta pode ser dado pessoal sensível. Nessas contas a IA trata só de horário, serviço,
        preço e endereço: ela não pede, não registra e não comenta informação clínica. Se um cliente
        contar um sintoma, a IA não comenta e deixa o assunto para o profissional.
      </p>

      <h2>5. Voz, microfone e Alexa</h2>
      <ul>
        <li>
          <strong>Modo Balcão:</strong> o microfone só é usado depois que você dá a permissão e liga
          o Modo Balcão. A palavra de ativação (&ldquo;Ei, Bora Marca&rdquo;) é reconhecida no
          próprio aparelho, sem enviar áudio para fora. Depois dela, o reconhecimento de fala do
          sistema do celular (Google no Android, Apple no iPhone) transforma o que você disse em
          texto, e só esse texto chega aos nossos servidores. Não gravamos nem guardamos o áudio do
          microfone.
        </li>
        <li>
          No Android, o Modo Balcão pode continuar escutando com a tela bloqueada, sempre com uma
          notificação fixa avisando e um botão para pausar. No iPhone, ele funciona só com o app
          aberto e a tela acesa.
        </li>
        <li>
          <strong>Áudios do WhatsApp:</strong> os áudios que os clientes mandam são enviados a um
          provedor de transcrição para virar texto, e a transcrição fica guardada junto da mensagem.
        </li>
        <li>
          <strong>Alexa:</strong> se você ligar a integração, a Amazon recebe o que você fala com a
          skill, conforme a política da Amazon, e os anúncios de pedidos são enviados pelo serviço
          Voice Monkey. A integração vem desligada e pode ser desfeita a qualquer momento.
        </li>
      </ul>

      <h2>6. Conexão com o WhatsApp</h2>
      <p>
        O app conecta o número do profissional como um <strong>aparelho conectado</strong>, do mesmo
        jeito que o WhatsApp Web, por meio de um servidor da própria Bora Marca. Essa conexão{' '}
        <strong>não é a API oficial do WhatsApp</strong> e a Bora Marca não é afiliada ao WhatsApp
        nem à Meta. As mensagens continuam passando pelo WhatsApp, que trata esses dados conforme a
        política dele. Para reduzir o risco de restrição do número, o sistema só responde a quem
        escreveu primeiro (ou a clientes com atendimento anterior ou na lista de espera), limita a
        quantidade de mensagens e não faz envio em massa.
      </p>

      <h2>7. Com quem compartilhamos</h2>
      <p>Compartilhamos dados só com prestadores necessários para o serviço funcionar:</p>
      <ul>
        <li>
          <strong>Provedores de IA:</strong> hoje DeepSeek (China) como principal e Qwen, da Alibaba
          Cloud (Singapura), como reserva. Recebem o contexto mínimo descrito na seção 4. O provedor
          é configurável; para contas de saúde recomendamos e podemos usar um provedor hospedado
          fora da China.
        </li>
        <li>
          <strong>Transcrição de áudio:</strong> Groq (Estados Unidos), que recebe o áudio das
          mensagens de voz dos clientes.
        </li>
        <li>
          <strong>Notificações:</strong> Google (Firebase Cloud Messaging) e Apple (Apple Push
          Notification service), que recebem o token do aparelho e o texto da notificação.
        </li>
        <li>
          <strong>Envio do código de acesso:</strong> o provedor de SMS que entrega o código ao seu
          celular.
        </li>
        <li>
          <strong>Alexa:</strong> Amazon e Voice Monkey, só se você ligar a integração.
        </li>
        <li>
          <strong>Hospedagem:</strong> o provedor de servidores onde ficam o banco de dados e a API.
        </li>
        <li>Autoridades, quando a lei ou uma ordem judicial exigir.</li>
      </ul>
      <p>
        Exigimos desses prestadores proteção dos dados igual ou superior à descrita nesta política,
        e que os usem só para prestar o serviço contratado.
      </p>

      <h2>8. Transferência internacional</h2>
      <p>
        Como alguns prestadores ficam fora do Brasil (China, Singapura e Estados Unidos), parte dos
        dados é transferida para outros países. Essas transferências seguem o artigo 33 da LGPD, com
        cláusulas contratuais que garantem a proteção dos dados, e se limitam ao necessário para
        cada função.
      </p>

      <h2>9. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          Dados da conta, dos clientes, da agenda e das conversas: enquanto a conta existir. Ao
          excluir a conta, eles são apagados na hora.
        </li>
        <li>Códigos de acesso: guardados só em forma cifrada e expiram em 10 minutos.</li>
        <li>Contatos do site: até 12 meses ou até você pedir a exclusão.</li>
        <li>Registros técnicos dos servidores: até 30 dias.</li>
        <li>Cópias de segurança: substituídas no ciclo de rotação, em até 30 dias.</li>
        <li>
          Registro de exclusão de conta: um código irreversível gerado a partir do telefone, as
          datas do pedido e da conclusão e a origem (app ou site), guardado por até 5 anos para
          comprovar que o pedido foi atendido.
        </li>
      </ul>

      <h2 id="exclusao">10. Como excluir sua conta</h2>
      <p>
        Você pode excluir a conta a qualquer momento no app (Ajustes → Excluir conta) ou, sem o app,
        na página <Link href="/excluir-conta">Excluir conta</Link>. A exclusão exige um código
        enviado ao seu celular, desconecta e apaga a sessão do WhatsApp, cancela lembretes e apaga
        seus dados e os dos seus clientes: cadastro, agenda, conversas, mensagens, transcrições e
        lista de espera. Fica só o registro mínimo descrito na seção 9.
      </p>

      <h2>11. Seus direitos</h2>
      <p>Pela LGPD, você pode pedir a qualquer momento:</p>
      <ul>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
        <li>portabilidade dos dados;</li>
        <li>eliminação dos dados e informação sobre com quem eles foram compartilhados;</li>
        <li>
          revogação do consentimento, como a permissão do microfone ou a integração com a Alexa;
        </li>
        <li>revisão de decisões tomadas só com base em tratamento automatizado.</li>
      </ul>
      <p>
        O profissional corrige a maior parte dos dados no próprio app e revoga permissões nos
        ajustes do celular. Para os outros pedidos, escreva para <Mail />. Respondemos em até 15
        dias. Se você é cliente de um profissional que usa a Bora Marca, fale com ele ou com a
        gente: encaminhamos o pedido e ajudamos a atendê-lo.
      </p>

      <h2>12. Segurança</h2>
      <p>
        Os dados trafegam com criptografia (HTTPS). Os códigos de acesso são guardados só como hash.
        Cada profissional acessa apenas os dados do próprio espaço, e as chaves dos serviços ficam
        fora do código, em variáveis protegidas do servidor.
      </p>

      <h2>13. Menores de idade</h2>
      <p>
        O app é destinado a profissionais maiores de 18 anos. Não coletamos dados de crianças de
        propósito; dados de clientes menores de idade são tratados só para marcar o atendimento, sob
        responsabilidade do profissional.
      </p>

      <h2>14. Encarregado pelo tratamento de dados</h2>
      <p>
        Para falar com o encarregado (DPO) da Bora Marca sobre seus dados, escreva para <Mail /> com
        o assunto &ldquo;Privacidade&rdquo;.
      </p>

      <h2>15. Mudanças nesta política</h2>
      <p>
        Quando esta política mudar, atualizamos a data no topo e avisamos no app se a mudança for
        relevante.
      </p>
    </LegalPage>
  );
}
