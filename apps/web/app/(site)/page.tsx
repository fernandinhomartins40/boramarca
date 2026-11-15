import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Faq } from '@/components/site/Faq';
import { btn, container } from '@/components/site/ui';
import { APPSTORE_URL, PLAY_URL } from '@/lib/site';

/** Interface icon from Bora-Marca-Kit/06-icones-interface (decorative). */
const Icon = ({ name, className = 'size-6' }: { name: string; className?: string }) => (
  <Image
    src={`/icones/${name}.svg`}
    alt=""
    width={24}
    height={24}
    className={className}
    unoptimized
  />
);

const Arrow = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

const AREAS = [
  { icon: 'psicologia', label: 'Psicologia' },
  { icon: 'tesoura', label: 'Beleza' },
  { icon: 'fisioterapia', label: 'Fisioterapia' },
  { icon: 'odontologia', label: 'Odontologia' },
];

const ROTINA = [
  {
    img: '17-card-proximo-atendimento',
    w: 1536,
    h: 768,
    alt: 'Card com o próximo atendimento: Rafael às 15:00',
    title: 'Sua agenda, em um só lugar',
    text: 'Veja o próximo atendimento, as vagas e os pedidos pendentes.',
  },
  {
    img: '04-balao-confirmacao',
    w: 1536,
    h: 1024,
    alt: 'Pedido de encaixe: Beatriz pode vir às 16h? Com botões Sim e Não',
    title: 'Cancelou? Aproveite a vaga',
    text: 'A IA consulta a lista de espera e sugere um encaixe.',
  },
  {
    img: '18-card-conversas',
    w: 1536,
    h: 1024,
    alt: 'Ícone de conversas do aplicativo',
    title: 'Conversas sob seu controle',
    text: 'Confira as respostas e assuma o atendimento quando quiser.',
  },
];

const PERMISSOES = [
  { label: 'Responder preço e endereço', state: 'on' },
  { label: 'Confirmar presença', state: 'on' },
  { label: 'Alterar outro agendamento', state: 'locked' },
] as const;

const PASSOS = [
  { n: '01', title: 'Conecte seu WhatsApp', text: 'Use o número que seus clientes conhecem.' },
  {
    n: '02',
    title: 'Configure seus serviços',
    text: 'Informe duração, valores e horários de atendimento.',
  },
  {
    n: '03',
    title: 'Ative seu assistente',
    text: 'Acompanhe a agenda e ajuste as permissões da IA.',
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Funciona para a minha profissão?',
    a: 'Se você presta serviços com hora marcada, pode organizar seus atendimentos com a Bora Marca: saúde, beleza, bem-estar, aulas e outros serviços. Em contas de saúde, a IA trata só de horário, serviço, preço e endereço, e nunca pede informação clínica.',
  },
  {
    q: 'Preciso trocar meu número?',
    a: 'Não. Você conecta o número que já usa, como um aparelho conectado ao WhatsApp, lendo um QR code ou digitando um código. Essa conexão não é a API oficial do WhatsApp e existe o risco de o WhatsApp restringir o número. Para reduzir esse risco, a Bora Marca só responde a quem escreveu primeiro, limita a quantidade de mensagens e não faz envio em massa.',
  },
  {
    q: 'Posso responder meus clientes?',
    a: 'Sim. Todas as conversas aparecem no app e você pode assumir qualquer uma quando quiser. A partir daí, a IA deixa aquela conversa com você.',
  },
  {
    q: 'Preciso de uma caixa Bluetooth?',
    a: 'Não. O Modo Balcão funciona com o alto-falante do próprio celular; a caixa só deixa a voz mais alta. No Android, o celular continua escutando com a tela bloqueada. No iPhone, o Modo Balcão funciona com o app aberto e a tela acesa; com o app fechado, os pedidos chegam por notificação com Sim e Não.',
  },
  {
    q: 'A IA muda a agenda sem me perguntar?',
    a: 'Só no que você permitir, como responder preço e endereço ou confirmar presença. Qualquer mudança no horário de outro cliente sempre vira uma pergunta para você. Se você não responder a tempo, a IA avisa o cliente que já confirma e não marca nada sozinha.',
  },
];

function Section({
  id,
  className = '',
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${container} scroll-mt-lg ${className}`}>
      {children}
    </section>
  );
}

export default function HomePage() {
  return (
    <main id="conteudo">
      {/* 2. Hero */}
      <Section>
        <div className="grid items-center gap-xl overflow-hidden rounded-[var(--bora-radius)] bg-brand-grafite px-[var(--bora-gutter)] pt-xxxl text-brand-neutro lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:pt-0">
          <div className="min-w-0 lg:py-xxxl">
            <p className="text-caption tracking-[0.2em] uppercase">
              Agenda inteligente para profissionais
            </p>
            <h1 className="mt-lg text-hero">
              <span className="lg:whitespace-nowrap">Você atende.</span>
              <br />
              <span className="text-brand-lima lg:whitespace-nowrap">Seu tempo volta.</span>
            </h1>
            <p className="mt-lg text-body">WhatsApp, agenda e voz trabalhando com você.</p>
            <div className="mt-xl flex flex-wrap gap-md">
              <Link href="/contato" className={`${btn.base} ${btn.accent}`}>
                Conhecer a Bora Marca <Arrow />
              </Link>
              {PLAY_URL && (
                <a
                  href={PLAY_URL}
                  className={`${btn.base} border border-brand-neutro text-brand-neutro`}
                >
                  Baixar no Google Play
                </a>
              )}
              {APPSTORE_URL && (
                <a
                  href={APPSTORE_URL}
                  className={`${btn.base} border border-brand-neutro text-brand-neutro`}
                >
                  Baixar na App Store
                </a>
              )}
            </div>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-[44rem] self-end lg:max-w-none">
            <Image
              src="/landing/01-hero-completo-1536.png"
              width={1536}
              height={864}
              alt="Celular com a agenda Bora Marca, placa de horários e pedido de confirmação"
              sizes="(min-width: 1216px) 760px, (min-width: 1024px) 62vw, 100vw"
              preload
              className="block h-auto w-full object-contain"
            />
          </div>
        </div>
      </Section>

      {/* 3. Áreas atendidas */}
      <Section className="mt-xxl">
        <div className="flex flex-col gap-sm border-b border-border pb-lg md:flex-row md:items-center md:justify-between">
          <p className="text-heading text-text">Feita para quem trabalha com hora marcada.</p>
          <p className="text-body-small text-text-muted">
            Saúde / Beleza / Bem-estar / Aulas / Outros serviços
          </p>
        </div>
        <div className="mt-xxl grid gap-xl lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <div>
            <h2 className="text-title text-text md:text-display">
              Para profissionais que vivem de hora marcada.
            </h2>
            <p className="mt-sm text-body-small text-text-muted">
              Saúde, beleza, bem-estar, aulas e outros serviços.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-md sm:grid-cols-3 md:grid-cols-5">
            {AREAS.map((a) => (
              <li
                key={a.label}
                className="flex flex-col items-center gap-sm rounded-md border border-border bg-surface px-sm py-lg text-caption text-text"
              >
                <Icon name={a.icon} className="size-7" />
                {a.label}
              </li>
            ))}
            <li className="flex items-center justify-center rounded-md bg-surface-alt px-sm py-lg text-center text-caption text-text">
              E muitas outras áreas
            </li>
          </ul>
        </div>
      </Section>

      {/* 4. Da conversa ao atendimento */}
      <Section id="como-funciona" className="mt-xxxl">
        <div className="grid gap-xl border-b border-border pb-xxxl lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-title text-text md:text-display">Da conversa ao atendimento.</h2>
            <p className="mt-md max-w-[28rem] text-body text-text">
              Seu cliente pergunta pelo WhatsApp. A IA consulta os serviços e horários disponíveis e
              conduz o agendamento.
            </p>
            <ul className="mt-xl flex flex-wrap gap-sm">
              {[
                ['conversa', 'Dúvidas sobre serviços'],
                ['calendario', 'Confirmações'],
                ['notificacao', 'Lembretes'],
              ].map(([icon, label]) => (
                <li
                  key={label}
                  className="flex items-center gap-sm rounded-md bg-surface-alt px-lg py-md text-caption text-text"
                >
                  <Icon name={icon!} className="size-5" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <div
            role="group"
            aria-label="Exemplo de conversa no WhatsApp"
            className="flex flex-col gap-md rounded-[var(--bora-radius)] bg-surface-alt p-xl text-body-small text-text"
          >
            <p className="max-w-[80%] self-start rounded-lg rounded-tl-sm bg-surface px-lg py-md shadow-sm">
              Tem horário amanhã à tarde?{' '}
              <span className="ml-sm text-caption text-text-muted">10:24</span>
            </p>
            <p className="max-w-[80%] self-end rounded-lg rounded-tr-sm bg-accent px-lg py-md text-on-accent shadow-sm">
              Tenho às 15h ou às 16h. Qual prefere?{' '}
              <span className="ml-sm text-caption">10:24 ✓✓</span>
            </p>
            <p className="max-w-[80%] self-start rounded-lg rounded-tl-sm bg-surface px-lg py-md shadow-sm">
              Às 16h. <span className="ml-sm text-caption text-text-muted">10:25</span>
            </p>
            <p className="mt-sm flex items-center gap-md self-center rounded-md bg-surface px-xl py-md font-semibold shadow-sm">
              <Icon name="calendario" className="size-5" />
              Ana · Amanhã, 16h
              <span className="flex size-6 items-center justify-center rounded-pill bg-primary text-on-primary">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-4 fill-none stroke-current stroke-[3]"
                >
                  <path d="m6 12 4 4 8-8" />
                </svg>
                <span className="sr-only">Confirmado</span>
              </span>
            </p>
          </div>
        </div>
      </Section>

      {/* 5. O que muda na sua rotina */}
      <Section id="recursos" className="mt-xxxl">
        <h2 className="text-title text-text md:text-display">O que muda na sua rotina.</h2>
        <ul className="mt-xl grid gap-lg md:grid-cols-3">
          {ROTINA.map((c) => (
            <li key={c.title} className="flex flex-col rounded-lg bg-surface-alt p-xl">
              <Image
                src={`/landing/${c.img}-1536.png`}
                width={c.w}
                height={c.h}
                alt={c.alt}
                sizes="(min-width: 768px) 30vw, 90vw"
                className="mx-auto h-auto w-full max-w-[20rem] object-contain"
              />
              <h3 className="mt-lg text-heading text-text">{c.title}</h3>
              <p className="mt-sm text-body-small text-text-muted">{c.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 6. Modo Balcão */}
      <Section id="modo-balcao" className="mt-xxxl">
        <div className="grid items-center gap-xl overflow-hidden rounded-[var(--bora-radius)] bg-primary px-[var(--bora-gutter)] py-xxxl text-on-primary lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <h2 className="text-hero">
              <span className="lg:whitespace-nowrap">Mãos ocupadas?</span>
              <br />
              <span className="text-brand-lima lg:whitespace-nowrap">Responda por voz.</span>
            </h2>
            <p className="mt-lg max-w-[28rem] text-body">
              No Modo Balcão, o celular anuncia os pedidos. Você responde falando ou toca em Sim ou
              Não.
            </p>
            <p className="mt-xl inline-flex items-center gap-md rounded-pill bg-surface py-sm pr-xl pl-sm text-body-small text-text">
              <span className="flex size-9 items-center justify-center rounded-pill bg-accent">
                <Icon name="microfone" className="size-5" />
              </span>
              O celular escuta. A caixa reproduz a voz.
            </p>
            <p className="mt-lg max-w-[28rem] text-caption">
              No Android, o celular escuta mesmo com a tela bloqueada. No iPhone, o Modo Balcão
              funciona com o app aberto e a tela acesa.
            </p>
          </div>
          <Image
            src="/landing/05-kit-voz-completo-1536.png"
            width={1536}
            height={1024}
            alt="Celular no Modo Balcão perguntando se pode marcar a Beatriz às 16h, ao lado de uma caixa de som Bluetooth"
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="mx-auto block h-auto w-full max-w-[44rem] object-contain"
          />
        </div>
      </Section>

      {/* 7. Permissões da IA */}
      <Section className="mt-xxxl">
        <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <h2 className="text-title text-text md:text-display">
              A IA facilita.
              <br />
              Você dá a palavra final.
            </h2>
            <p className="mt-md text-body-small text-text">
              Defina o que pode acontecer automaticamente. Mudanças no horário de outro cliente{' '}
              <strong>sempre</strong> passam por você.
            </p>
          </div>
          <Image
            src="/landing/04-balao-confirmacao-1536.png"
            width={1536}
            height={1024}
            alt="Pergunta ao profissional: Beatriz pode vir às 16h? Com botões Sim e Não"
            sizes="(min-width: 1024px) 28vw, 90vw"
            className="mx-auto h-auto w-full max-w-[24rem] object-contain"
          />
          <ul
            aria-label="Exemplo de permissões da IA"
            className="divide-y divide-border text-body-small text-text lg:border-l lg:border-border lg:pl-xl"
          >
            {PERMISSOES.map((p) => (
              <li
                key={p.label}
                className="flex items-center justify-between gap-md py-md font-semibold"
              >
                {p.label}
                {p.state === 'on' ? (
                  <span className="flex h-6 w-11 shrink-0 items-center justify-end rounded-pill bg-success p-xs">
                    <span aria-hidden className="size-4 rounded-pill bg-brand-grafite" />
                    <span className="sr-only">Ligado</span>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-xs">
                    <Icon name="cadeado" className="size-4" />
                    <span className="rounded-pill bg-surface-alt px-sm py-xs text-caption text-primary-text">
                      Sempre pergunta
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 8. Três passos */}
      <Section className="mt-xxxl">
        <h2 className="text-title text-text md:text-display">Comece com o que você já usa.</h2>
        <ol className="mt-xl grid gap-xl md:grid-cols-3">
          {PASSOS.map((p) => (
            <li key={p.n} className="flex gap-lg">
              <span aria-hidden className="text-display text-primary-text">
                {p.n}
              </span>
              <div>
                <h3 className="text-body font-semibold text-text">{p.title}</h3>
                <p className="mt-xs text-body-small text-text-muted">{p.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* 9. Dúvidas */}
      <Section id="duvidas" className="mt-xxxl">
        <div className="grid gap-xl lg:grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)]">
          <h2 className="text-title text-text md:text-display">Antes de começar.</h2>
          <Faq items={FAQ} />
        </div>
      </Section>

      {/* 10. Chamada final */}
      <Section className="mt-xxxl">
        <div className="flex flex-col items-start gap-xl rounded-[var(--bora-radius)] bg-brand-grafite px-[var(--bora-gutter)] py-xxl text-brand-neutro md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-xl">
            <Image
              src="/marca/simbolo-mono-branco.svg"
              alt=""
              width={236}
              height={304}
              unoptimized
              className="h-14 w-auto md:h-16"
            />
            <span aria-hidden className="hidden h-16 w-px bg-brand-neutro/30 md:block" />
            <p className="text-title md:text-display">
              Bora cuidar
              <br />
              do seu tempo?
            </p>
          </div>
          <Link href="/contato" className={`${btn.base} ${btn.accent}`}>
            Quero conhecer a Bora Marca <Arrow />
          </Link>
        </div>
      </Section>
    </main>
  );
}
