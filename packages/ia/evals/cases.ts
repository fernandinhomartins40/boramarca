import type { AiToolName, Profession } from '@boramarca/shared';

export type EvalCategory =
  | 'cancelamento'
  | 'pedido_horario'
  | 'remarcacao'
  | 'atraso'
  | 'preco'
  | 'endereco'
  | 'audio'
  | 'ambigua'
  | 'giria'
  | 'sintoma'
  | 'confirmacao'
  | 'lista_espera';

export interface EvalCase {
  id: string;
  area: 'beleza' | 'saude';
  profession: Profession;
  category: EvalCategory;
  text: string;
  transcribedFromAudio?: boolean;
  /** The client already has an appointment today at 15h (needed for cancel/reschedule/delay). */
  hasAppointment?: boolean;
  /** Passing = at least one call uses one of these tools. */
  expect: AiToolName[];
}

const ASK: AiToolName = 'perguntar_ao_profissional';
const REPLY: AiToolName = 'responder_cliente';
const SLOTS: AiToolName[] = [ASK, 'buscar_vagas', 'listar_agenda', 'marcar'];

const b = (profession: Profession) => ({ area: 'beleza' as const, profession });
const s = (profession: Profession) => ({ area: 'saude' as const, profession });

export const CASES: EvalCase[] = [
  // Cancelamento
  {
    id: 'c1',
    ...b('barbeiro'),
    category: 'cancelamento',
    hasAppointment: true,
    text: 'não vou conseguir ir hoje às 15h',
    expect: ['cancelar'],
  },
  {
    id: 'c2',
    ...b('manicure'),
    category: 'cancelamento',
    hasAppointment: true,
    text: 'Oi, preciso cancelar meu horário de hoje, surgiu um imprevisto',
    expect: ['cancelar'],
  },
  {
    id: 'c3',
    ...s('psicologo'),
    category: 'cancelamento',
    hasAppointment: true,
    text: 'Boa tarde, hoje não vou poder comparecer à sessão. Pode desmarcar?',
    expect: ['cancelar'],
  },
  {
    id: 'c4',
    ...s('dentista'),
    category: 'cancelamento',
    hasAppointment: true,
    text: 'desmarca minha consulta das 15h por favor',
    expect: ['cancelar'],
  },
  {
    id: 'c5',
    ...b('cabeleireiro'),
    category: 'cancelamento',
    hasAppointment: true,
    text: 'vou ter que furar hoje, foi mal',
    expect: ['cancelar'],
  },
  // Pedido de horário
  {
    id: 'h1',
    ...b('barbeiro'),
    category: 'pedido_horario',
    text: 'tem horário hoje à tarde?',
    expect: SLOTS,
  },
  {
    id: 'h2',
    ...b('manicure'),
    category: 'pedido_horario',
    text: 'Queria marcar pé e mão no sábado de manhã',
    expect: SLOTS,
  },
  {
    id: 'h3',
    ...b('esteticista'),
    category: 'pedido_horario',
    text: 'Vocês têm vaga amanhã depois das 18h para limpeza de pele?',
    expect: SLOTS,
  },
  {
    id: 'h4',
    ...s('fisioterapeuta'),
    category: 'pedido_horario',
    text: 'Gostaria de agendar uma sessão para quinta-feira',
    expect: SLOTS,
  },
  {
    id: 'h5',
    ...s('dentista'),
    category: 'pedido_horario',
    text: 'Quero marcar uma avaliação, qual o primeiro horário livre?',
    expect: SLOTS,
  },
  {
    id: 'h6',
    ...b('professor_instrutor'),
    category: 'pedido_horario',
    text: 'Tem aula disponível hoje às 16h?',
    expect: SLOTS,
  },
  // Remarcação
  {
    id: 'r1',
    ...b('barbeiro'),
    category: 'remarcacao',
    hasAppointment: true,
    text: 'dá pra passar meu horário das 15h para as 16h30?',
    expect: [ASK, 'remarcar'],
  },
  {
    id: 'r2',
    ...b('cabeleireiro'),
    category: 'remarcacao',
    hasAppointment: true,
    text: 'Consigo trocar para amanhã no mesmo horário?',
    expect: [ASK, 'remarcar', 'buscar_vagas'],
  },
  {
    id: 'r3',
    ...s('psicologo'),
    category: 'remarcacao',
    hasAppointment: true,
    text: 'Seria possível remarcar a sessão de hoje para sexta?',
    expect: [ASK, 'remarcar', 'buscar_vagas'],
  },
  {
    id: 'r4',
    ...s('fisioterapeuta'),
    category: 'remarcacao',
    hasAppointment: true,
    text: 'posso ir mais cedo hoje? tipo 14h30',
    expect: [ASK, 'remarcar'],
  },
  // Atraso
  {
    id: 'a1',
    ...b('barbeiro'),
    category: 'atraso',
    hasAppointment: true,
    text: 'vou atrasar uns 15 minutos',
    expect: [ASK, REPLY],
  },
  {
    id: 'a2',
    ...b('manicure'),
    category: 'atraso',
    hasAppointment: true,
    text: 'Tô presa no trânsito, chego 15h20',
    expect: [ASK, REPLY],
  },
  {
    id: 'a3',
    ...s('dentista'),
    category: 'atraso',
    hasAppointment: true,
    text: 'Estou chegando com 10 min de atraso, desculpa',
    expect: [ASK, REPLY],
  },
  // Preço e endereço
  { id: 'p1', ...b('barbeiro'), category: 'preco', text: 'quanto tá o corte?', expect: [REPLY] },
  {
    id: 'p2',
    ...b('esteticista'),
    category: 'preco',
    text: 'Qual o valor da barba?',
    expect: [REPLY],
  },
  {
    id: 'p3',
    ...s('fisioterapeuta'),
    category: 'preco',
    text: 'Quanto custa a sessão?',
    expect: [REPLY],
  },
  {
    id: 'p4',
    ...s('psicologo'),
    category: 'preco',
    text: 'Qual o valor da consulta? Aceita pix?',
    expect: [REPLY, ASK],
  },
  {
    id: 'e1',
    ...b('cabeleireiro'),
    category: 'endereco',
    text: 'onde fica o espaço?',
    expect: [REPLY],
  },
  {
    id: 'e2',
    ...s('dentista'),
    category: 'endereco',
    text: 'Me passa o endereço do consultório, por favor',
    expect: [REPLY],
  },
  // Áudio transcrito
  {
    id: 'au1',
    ...b('barbeiro'),
    category: 'audio',
    transcribedFromAudio: true,
    text: 'ô meu, fala aí, tem como encaixar eu hoje mais tarde aí, umas cinco hora',
    expect: SLOTS,
  },
  {
    id: 'au2',
    ...b('manicure'),
    category: 'audio',
    transcribedFromAudio: true,
    hasAppointment: true,
    text: 'oi amiga, então, eu não vou conseguir ir hoje não tá, aconteceu um negócio aqui, depois a gente marca',
    expect: ['cancelar', ASK],
  },
  {
    id: 'au3',
    ...s('fisioterapeuta'),
    category: 'audio',
    transcribedFromAudio: true,
    text: 'boa tarde, queria saber se tem horário na semana que vem de manhã cedo, tipo sete, oito horas',
    expect: SLOTS,
  },
  {
    id: 'au4',
    ...s('psicologo'),
    category: 'audio',
    transcribedFromAudio: true,
    hasAppointment: true,
    text: 'oi, é só pra avisar que eu vou chegar uns cinco minutinhos atrasado tá bom',
    expect: [ASK, REPLY],
  },
  // Ambígua
  { id: 'm1', ...b('barbeiro'), category: 'ambigua', text: 'e aí?', expect: [REPLY, ASK] },
  {
    id: 'm2',
    ...b('cabeleireiro'),
    category: 'ambigua',
    text: 'aquele horário lá ainda tá de pé?',
    expect: [REPLY, ASK],
  },
  { id: 'm3', ...s('dentista'), category: 'ambigua', text: 'pode ser', expect: [REPLY, ASK] },
  { id: 'm4', ...b('esteticista'), category: 'ambigua', text: '??', expect: [REPLY, ASK] },
  // Gíria
  {
    id: 'g1',
    ...b('barbeiro'),
    category: 'giria',
    text: 'salve, tem como dar um tapa no visual hj?',
    expect: SLOTS,
  },
  {
    id: 'g2',
    ...b('barbeiro'),
    category: 'giria',
    text: 'fala chefe, rola um degradê sábado cedo?',
    expect: SLOTS,
  },
  {
    id: 'g3',
    ...b('manicure'),
    category: 'giria',
    text: 'miga, bora fazer as unha amanhã? kkkk',
    expect: SLOTS,
  },
  {
    id: 'g4',
    ...b('cabeleireiro'),
    category: 'giria',
    text: 'mano quanto ta pra dar um trato no cabelo',
    expect: [REPLY],
  },
  // Sintoma (health and beauty): must not be recorded
  {
    id: 's1',
    ...s('dentista'),
    category: 'sintoma',
    text: 'Estou com muita dor de dente desde ontem, tem horário hoje?',
    expect: SLOTS,
  },
  {
    id: 's2',
    ...s('psicologo'),
    category: 'sintoma',
    text: 'tô tendo crises de ansiedade toda noite, preciso de uma consulta logo',
    expect: SLOTS,
  },
  {
    id: 's3',
    ...s('fisioterapeuta'),
    category: 'sintoma',
    text: 'Torci o tornozelo jogando bola e tá muito inchado. Vocês atendem amanhã?',
    expect: SLOTS,
  },
  {
    id: 's4',
    ...b('esteticista'),
    category: 'sintoma',
    text: 'Minha pele tá com alergia, posso fazer a limpeza mesmo assim?',
    expect: [REPLY, ASK],
  },
  {
    id: 's5',
    ...s('dentista'),
    category: 'sintoma',
    text: 'Tomei antibiótico essa semana, isso atrapalha? Quero marcar limpeza',
    expect: [REPLY, ASK, ...SLOTS],
  },
  // Confirmação e lista de espera
  {
    id: 'k1',
    ...b('barbeiro'),
    category: 'confirmacao',
    hasAppointment: true,
    text: '1',
    expect: ['confirmar_presenca'],
  },
  {
    id: 'k2',
    ...s('fisioterapeuta'),
    category: 'confirmacao',
    hasAppointment: true,
    text: 'Confirmo, estarei aí',
    expect: ['confirmar_presenca'],
  },
  {
    id: 'w1',
    ...b('manicure'),
    category: 'lista_espera',
    text: 'se abrir alguma vaga sábado me avisa?',
    expect: ['entrar_lista_de_espera'],
  },
  {
    id: 'w2',
    ...s('psicologo'),
    category: 'lista_espera',
    text: 'Se surgir horário à noite durante a semana, pode me avisar',
    expect: ['entrar_lista_de_espera'],
  },
];
