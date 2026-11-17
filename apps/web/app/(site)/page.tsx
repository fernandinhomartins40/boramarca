import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  BellRing,
  Brain,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCheck,
  Flower2,
  LockKeyhole,
  type LucideIcon,
  MessageCircle,
  Mic,
  PersonStanding,
  Scissors,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { Faq } from '@/components/site/Faq';
import { btn, container } from '@/components/site/ui';
import { APPSTORE_URL, PLAY_URL, SIGNUP_CTA } from '@/lib/site';

const Arrow = () => <ArrowUpRight aria-hidden className="size-5" strokeWidth={2.25} />;

const AREAS: { icon: LucideIcon; label: string }[] = [
  { icon: Brain, label: 'Psicologia' },
  { icon: Scissors, label: 'Beleza' },
  { icon: PersonStanding, label: 'Fisioterapia' },
  { icon: Stethoscope, label: 'Saúde' },
  { icon: Flower2, label: 'Bem-estar' },
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
    <section id={id} className={`${container} scroll-mt-xxl ${className}`}>
      {children}
    </section>
  );
}

const gap = 'mt-[clamp(4rem,9vw,7rem)]';
const h2 =
  'text-[clamp(1.75rem,4.2vw,2.75rem)] leading-[1.08] font-bold tracking-[-0.02em] text-balance text-text';
const eyebrow =
  'inline-flex items-center gap-sm rounded-pill px-md py-xs text-caption font-semibold tracking-[0.14em] uppercase';
const darkOutline = `${btn.base} bm-glass text-brand-neutro hover:bg-brand-neutro/15`;

export default function HomePage() {
  return (
    <main id="conteudo" className="overflow-x-clip">
      {/* 2. Hero */}
      <Section className="pt-sm">
        <div className="bm-hero grid items-center gap-xl overflow-hidden rounded-[var(--bora-radius)] px-[var(--bora-gutter)] pt-xxxl text-brand-neutro lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:pt-0">
          <div className="min-w-0 lg:py-[clamp(3rem,6vw,6rem)]">
            <p className={`${eyebrow} bm-glass text-brand-neutro`}>
              <span aria-hidden className="size-2 shrink-0 rounded-pill bg-brand-lima" />
              Agenda inteligente para profissionais
            </p>
            <h1 className="mt-xl text-[clamp(2.4rem,4.6vw,3.9rem)] leading-[1.02] font-extrabold tracking-[-0.03em]">
              <span className="lg:whitespace-nowrap">Você atende.</span>
              <br />
              <span className="text-brand-lima lg:whitespace-nowrap">Seu tempo volta.</span>
            </h1>
            <p className="mt-lg max-w-md text-body text-brand-neutro/80">
              WhatsApp, agenda e voz trabalhando com você.
            </p>
            <div className="mt-xl flex flex-col gap-md sm:flex-row sm:flex-wrap">
              <Link href="/cadastro" className={`${btn.base} ${btn.accent} bm-lift`}>
                {SIGNUP_CTA} <Arrow />
              </Link>
              <Link href="/contato" className={darkOutline}>
                Conhecer a Bora Marca
              </Link>
              {PLAY_URL && (
                <a href={PLAY_URL} className={darkOutline}>
                  Baixar no Google Play
                </a>
              )}
              {APPSTORE_URL && (
                <a href={APPSTORE_URL} className={darkOutline}>
                  Baixar na App Store
                </a>
              )}
            </div>
            <ul className="mt-xl flex flex-wrap gap-x-xl gap-y-sm text-body-small text-brand-neutro/75">
              {['14 dias grátis', 'Sem cartão para testar', 'Cancele quando quiser'].map((t) => (
                <li key={t} className="flex items-center gap-xs">
                  <Check aria-hidden className="size-4 text-brand-lima" strokeWidth={3} />
                  {t}
                </li>
              ))}
            </ul>
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
            Saúde · Beleza · Bem-estar · Aulas · Outros serviços
          </p>
        </div>
        <div className="mt-xxl grid gap-xl lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <div>
            <h2 className={h2}>Para profissionais que vivem de hora marcada.</h2>
            <p className="mt-sm text-body text-text-muted">
              Saúde, beleza, bem-estar, aulas e outros serviços.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {AREAS.map(({ icon: I, label }) => (
              <li
                key={label}
                className="bm-soft flex flex-col items-center gap-sm rounded-lg px-sm py-lg text-center text-body-small font-semibold text-text"
              >
                <span className="flex size-11 items-center justify-center rounded-md bg-surface text-primary-text shadow-sm">
                  <I aria-hidden className="size-6" strokeWidth={1.75} />
                </span>
                {label}
              </li>
            ))}
            <li className="flex items-center justify-center rounded-lg bg-primary px-sm py-lg text-center text-body-small font-semibold text-on-primary">
              E muitas outras áreas
            </li>
          </ul>
        </div>
      </Section>

      {/* 4. Da conversa ao atendimento */}
      <Section id="como-funciona" className={gap}>
        <div className="grid gap-xxl lg:grid-cols-2 lg:items-center">
          <div>
            <p className={`${eyebrow} bg-surface-alt text-primary-text`}>
              <MessageCircle aria-hidden className="size-4" /> WhatsApp
            </p>
            <h2 className={`${h2} mt-lg`}>Da conversa ao atendimento.</h2>
            <p className="mt-md max-w-md text-body text-text-muted">
              Seu cliente pergunta pelo WhatsApp. A IA consulta os serviços e horários disponíveis e
              conduz o agendamento.
            </p>
            <ul className="mt-xl flex flex-wrap gap-sm">
              {(
                [
                  [MessageCircle, 'Dúvidas sobre serviços'],
                  [CalendarCheck, 'Confirmações'],
                  [BellRing, 'Lembretes'],
                ] as const
              ).map(([I, label]) => (
                <li
                  key={label}
                  className="flex items-center gap-sm rounded-pill border border-border bg-surface px-lg py-sm text-body-small font-medium text-text"
                >
                  <I aria-hidden className="size-4 text-primary-text" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <div
            role="group"
            aria-label="Exemplo de conversa no WhatsApp"
            className="bm-soft bm-lift flex flex-col gap-md rounded-[var(--bora-radius)] p-[clamp(1rem,3vw,2rem)] text-body-small text-text"
          >
            <p className="max-w-[85%] self-start rounded-lg rounded-tl-sm bg-surface px-lg py-md shadow-sm">
              Tem horário amanhã à tarde?{' '}
              <span className="ml-xs text-caption whitespace-nowrap text-text-muted">10:24</span>
            </p>
            <p className="max-w-[85%] self-end rounded-lg rounded-tr-sm bg-accent px-lg py-md text-on-accent shadow-sm">
              Tenho às 15h ou às 16h. Qual prefere?{' '}
              <span className="ml-xs inline-flex items-center gap-xs text-caption whitespace-nowrap">
                10:24 <CheckCheck aria-label="lida" className="size-4" />
              </span>
            </p>
            <p className="max-w-[85%] self-start rounded-lg rounded-tl-sm bg-surface px-lg py-md shadow-sm">
              Às 16h. <span className="ml-xs text-caption text-text-muted">10:25</span>
            </p>
            <p className="mt-sm flex items-center gap-md self-center rounded-pill bg-surface px-xl py-md font-semibold shadow-md">
              <CalendarDays aria-hidden className="size-5 shrink-0 text-primary-text" />
              Ana · Amanhã, 16h
              <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary text-on-primary">
                <Check aria-hidden className="size-4" strokeWidth={3} />
                <span className="sr-only">Confirmado</span>
              </span>
            </p>
          </div>
        </div>
      </Section>

      {/* 5. O que muda na sua rotina */}
      <Section id="recursos" className={gap}>
        <h2 className={h2}>O que muda na sua rotina.</h2>
        <ul className="mt-xl grid gap-lg md:grid-cols-3">
          {ROTINA.map((c) => (
            <li
              key={c.title}
              className="bm-soft flex flex-col rounded-[var(--bora-radius)] p-xl transition-transform hover:-translate-y-1 motion-reduce:transition-none"
            >
              <div className="flex aspect-[3/2] items-center justify-center">
                <Image
                  src={`/landing/${c.img}-1536.png`}
                  width={c.w}
                  height={c.h}
                  alt={c.alt}
                  sizes="(min-width: 768px) 30vw, 90vw"
                  className="h-full w-auto max-w-full object-contain"
                />
              </div>
              <h3 className="mt-lg text-heading text-text">{c.title}</h3>
              <p className="mt-sm text-body-small text-text-muted">{c.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 6. Modo Balcão */}
      <Section id="modo-balcao" className={gap}>
        <div className="bm-voz grid items-center gap-xl overflow-hidden rounded-[var(--bora-radius)] px-[var(--bora-gutter)] py-[clamp(2.5rem,6vw,5rem)] text-on-primary lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className={`${eyebrow} bm-glass`}>
              <Mic aria-hidden className="size-4" /> Modo Balcão
            </p>
            <h2 className="mt-lg text-[clamp(2.2rem,4.2vw,3.6rem)] leading-[1.02] font-extrabold tracking-[-0.03em]">
              <span className="lg:whitespace-nowrap">Mãos ocupadas?</span>
              <br />
              <span className="text-brand-lima lg:whitespace-nowrap">Responda por voz.</span>
            </h2>
            <p className="mt-lg max-w-md text-body text-on-primary/90">
              No Modo Balcão, o celular anuncia os pedidos. Você responde falando ou toca em Sim ou
              Não.
            </p>
            <p className="mt-xl inline-flex items-center gap-md rounded-pill bg-surface py-sm pr-xl pl-sm text-body-small font-medium text-text shadow-lg">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-accent text-on-accent">
                <Mic aria-hidden className="size-5" />
              </span>
              O celular escuta. A caixa reproduz a voz.
            </p>
            <p className="mt-lg max-w-md text-caption text-on-primary/80">
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
      <Section className={gap}>
        <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className={`${eyebrow} bg-surface-alt text-primary-text`}>
              <Sparkles aria-hidden className="size-4" /> IA com limites
            </p>
            <h2 className={`${h2} mt-lg`}>
              A IA facilita.
              <br />
              Você dá a palavra final.
            </h2>
            <p className="mt-md text-body text-text-muted">
              Defina o que pode acontecer automaticamente. Mudanças no horário de outro cliente{' '}
              <strong className="text-text">sempre</strong> passam por você.
            </p>
          </div>
          <Image
            src="/landing/04-balao-confirmacao-1536.png"
            width={1536}
            height={1024}
            alt="Pergunta ao profissional: Beatriz pode vir às 16h? Com botões Sim e Não"
            sizes="(min-width: 1024px) 28vw, 90vw"
            className="mx-auto h-auto w-full max-w-sm object-contain"
          />
          <ul
            aria-label="Exemplo de permissões da IA"
            className="bm-soft divide-y divide-border rounded-lg px-lg text-body-small text-text"
          >
            {PERMISSOES.map((p) => (
              <li
                key={p.label}
                className="flex items-center justify-between gap-md py-md font-semibold"
              >
                <span className="min-w-0">{p.label}</span>
                {p.state === 'on' ? (
                  <span className="flex h-6 w-11 shrink-0 items-center justify-end rounded-pill bg-success p-xs">
                    <span aria-hidden className="size-4 rounded-pill bg-brand-grafite" />
                    <span className="sr-only">Ligado</span>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-xs">
                    <LockKeyhole aria-hidden className="size-4 text-text-muted" />
                    <span className="rounded-pill bg-surface px-sm py-xs text-caption whitespace-nowrap text-primary-text">
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
      <Section className={gap}>
        <h2 className={h2}>Comece com o que você já usa.</h2>
        <ol className="mt-xl grid gap-lg md:grid-cols-3">
          {PASSOS.map((p) => (
            <li key={p.n} className="flex gap-lg rounded-lg border border-border bg-surface p-xl">
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary text-heading font-bold text-on-primary"
              >
                {p.n}
              </span>
              <div className="min-w-0">
                <h3 className="text-body font-semibold text-text">{p.title}</h3>
                <p className="mt-xs text-body-small text-text-muted">{p.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* 9. Dúvidas */}
      <Section id="duvidas" className={gap}>
        <div className="grid gap-xl lg:grid-cols-[minmax(0,0.4fr)_minmax(0,1fr)]">
          <h2 className={h2}>Antes de começar.</h2>
          <Faq items={FAQ} />
        </div>
      </Section>

      {/* 10. Chamada final */}
      <Section className={`${gap} mb-xxl`}>
        <div className="bm-cta flex flex-col items-start gap-xl overflow-hidden rounded-[var(--bora-radius)] px-[var(--bora-gutter)] py-[clamp(2.5rem,5vw,4rem)] text-brand-neutro md:flex-row md:items-center md:justify-between">
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
            <p className="text-[clamp(1.6rem,3.6vw,2.5rem)] leading-[1.1] font-bold tracking-[-0.02em]">
              Bora cuidar
              <br />
              do seu tempo?
            </p>
          </div>
          <Link href="/cadastro" className={`${btn.base} ${btn.accent} bm-lift w-full sm:w-auto`}>
            {SIGNUP_CTA} <Arrow />
          </Link>
        </div>
      </Section>
    </main>
  );
}
