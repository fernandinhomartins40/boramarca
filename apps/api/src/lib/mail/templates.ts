// E-mail templates (pt-BR). Pure functions: data in, subject + HTML + text out. One base layout:
// tables and inline CSS (Gmail/Outlook), 600 px, logo as an absolute PNG URL (mail clients do not
// render SVG), colors and type only from packages/shared theme.ts, a dark-mode override for
// clients that honor prefers-color-scheme, and a plain-text version of everything.
import {
  brand,
  darkColors,
  fontFamilyWeb,
  lightColors,
  PROFESSION_LABELS,
} from '@boramarca/shared';
import type { MailContent } from './mailer';

const L = lightColors;
const D = darkColors;
const FONT = fontFamilyWeb.replace(/"/g, "'");

export const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

interface Content {
  subject: string;
  /** Summary shown next to the subject in the inbox. */
  preheader: string;
  title: string;
  /** Plain-text paragraphs (escaped in the HTML). */
  body: string[];
  /** Label/value box. */
  facts?: [label: string, value: string][];
  /** Bulleted list (plain text) and the line above it. */
  list?: string[];
  listTitle?: string;
  cta?: { label: string; url: string };
  /** Smaller note under the button. */
  note?: string;
  /** Footer line explaining why this mail arrived. */
  reason: string;
}

export interface MailContext {
  /** Public site, e.g. https://boramarca.com.br (logo and footer links). */
  site: string;
  /** Support address shown in the footer. */
  support: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** `14/03/2030 às 09:30` in the salon timezone. */
export function formatDateTime(d: Date, timeZone = 'America/Sao_Paulo') {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const p = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')}`;
}

function render(ctx: MailContext, c: Content): MailContent {
  const site = ctx.site.replace(/\/$/, '');
  const text = [
    c.title,
    '',
    ...c.body.flatMap((b) => [b, '']),
    ...(c.facts ? [...c.facts.map(([l, v]) => `${l}: ${v}`), ''] : []),
    ...(c.list ? [...(c.listTitle ? [c.listTitle] : []), ...c.list.map((i) => `- ${i}`), ''] : []),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '--',
    'Bora Marca: agenda inteligente para quem vive de hora marcada',
    site,
    `Dúvidas: ${ctx.support}`,
    c.reason,
  ].join('\n');

  const para = (t: string, size: number, line: number, cls: string, color: string) =>
    `<p class="${cls}" style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:${line}px;color:${color};">${esc(t)}</p>`;

  const facts = c.facts
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                <tr><td class="bm-box" bgcolor="${L.surfaceAlt}" style="padding:16px 20px;background:${L.surfaceAlt};border-radius:14px;font-family:${FONT};font-size:15px;line-height:24px;color:${L.text};">
                  ${c.facts
                    .map(
                      ([l, v]) =>
                        `<span class="bm-muted" style="color:${L.textMuted};">${esc(l)}:</span> <strong class="bm-text" style="color:${L.text};white-space:pre-line;">${esc(v)}</strong>`,
                    )
                    .join('<br>\n                  ')}
                </td></tr>
              </table>`
    : '';
  const list = c.list
    ? `${
        c.listTitle
          ? `<p class="bm-text" style="margin:0 0 8px;font-family:${FONT};font-size:17px;line-height:26px;font-weight:700;color:${L.text};">${esc(c.listTitle)}</p>
              `
          : ''
      }<ul style="margin:0 0 20px;padding:0 0 0 20px;">
                ${c.list.map((i) => `<li class="bm-text" style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:24px;color:${L.text};">${esc(i)}</li>`).join('\n                ')}
              </ul>`
    : '';
  const cta = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                <tr><td align="center" bgcolor="${L.primary}" style="border-radius:999px;background:${L.primary};">
                  <a href="${esc(c.cta.url)}" target="_blank" style="display:inline-block;padding:16px 32px;font-family:${FONT};font-size:17px;font-weight:700;line-height:20px;color:${L.onPrimary};text-decoration:none;border-radius:999px;">${esc(c.cta.label)}</a>
                </td></tr>
              </table>
              <p class="bm-muted" style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:18px;color:${L.textMuted};">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(c.cta.url)}" class="bm-link" style="color:${L.primaryText};word-break:break-all;">${esc(c.cta.url)}</a></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(c.subject)}</title>
<style>
  body { margin:0; padding:0; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .bm-card { padding:28px 22px !important; }
    .bm-head { padding:20px 22px !important; }
    .bm-title { font-size:24px !important; line-height:30px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bm-bg { background:${D.bg} !important; }
    .bm-card { background:${D.surface} !important; border-color:${D.border} !important; }
    .bm-box { background:${D.surfaceAlt} !important; }
    .bm-text, .bm-title { color:${D.text} !important; }
    .bm-muted { color:${D.textMuted} !important; }
    .bm-link { color:${D.primaryText} !important; }
  }
</style>
</head>
<body class="bm-bg" style="margin:0;padding:0;background:${L.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">${esc(c.preheader)}${'&nbsp;&zwnj;'.repeat(30)}</div>
<table role="presentation" class="bm-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.bg}" style="background:${L.bg};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td class="bm-head" align="left" bgcolor="${brand.grafite}" style="padding:24px 44px;background:${brand.grafite};border-radius:24px 24px 0 0;">
        <a href="${esc(site)}" target="_blank" style="text-decoration:none;"><img src="${esc(site)}/email/logo-horizontal-negativo.png" width="180" height="40" alt="Bora Marca" style="display:block;width:180px;height:40px;font-family:${FONT};font-size:24px;font-weight:700;color:${brand.lima};"></a>
      </td></tr>
      <tr><td height="6" bgcolor="${brand.lima}" style="height:6px;line-height:6px;font-size:0;background:${brand.lima};">&nbsp;</td></tr>
      <tr><td class="bm-card" bgcolor="${L.surface}" style="padding:40px 44px 24px;background:${L.surface};border:1px solid ${L.border};border-top:0;border-radius:0 0 24px 24px;">
              <h1 class="bm-title" style="margin:0 0 20px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:700;color:${L.text};">${esc(c.title)}</h1>
              ${c.body.map((b) => para(b, 17, 26, 'bm-text', L.text)).join('\n              ')}
              ${facts}${list}${cta}
              ${c.note ? para(c.note, 15, 22, 'bm-muted', L.textMuted) : ''}
      </td></tr>
      <tr><td align="center" class="bm-muted" style="padding:24px 20px 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${L.textMuted};">
        <strong class="bm-text" style="color:${L.text};">Bora Marca</strong>: agenda inteligente para quem vive de hora marcada<br>
        <a href="${esc(site)}" target="_blank" class="bm-muted" style="color:${L.textMuted};text-decoration:underline;">${esc(site.replace(/^https?:\/\//, ''))}</a> &nbsp;·&nbsp;
        <a href="${esc(site)}/privacidade" target="_blank" class="bm-muted" style="color:${L.textMuted};text-decoration:underline;">Privacidade</a> &nbsp;·&nbsp;
        <a href="mailto:${esc(ctx.support)}" class="bm-muted" style="color:${L.textMuted};text-decoration:underline;">${esc(ctx.support)}</a>
      </td></tr>
      <tr><td align="center" class="bm-muted" style="padding:0 20px 24px;font-family:${FONT};font-size:12px;line-height:18px;color:${L.textMuted};">
        ${esc(c.reason)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject: c.subject, html, text };
}

const SELF =
  'Você recebeu este e-mail porque cadastrou este endereço no app Bora Marca. Mensagem automática.';

export function mailTemplates(ctx: MailContext) {
  return {
    /** (a) Confirmation link for a new address (single use, 24 h). */
    confirmEmail: (v: { name: string; url: string; ttlHours: number }) =>
      render(ctx, {
        subject: 'Confirme seu e-mail no Bora Marca',
        preheader: `Toque no botão para confirmar. O link vale por ${v.ttlHours} horas.`,
        title: 'Confirme seu e-mail',
        body: [
          `Oi, ${firstName(v.name)}!`,
          'Você cadastrou este e-mail na sua conta do Bora Marca. Toque no botão para confirmar que ele é seu. Só depois disso a gente manda outros e-mails para cá.',
        ],
        cta: { label: 'Confirmar meu e-mail', url: v.url },
        note: `O link vale por ${v.ttlHours} horas e só funciona uma vez. Se você não cadastrou este e-mail, pode ignorar esta mensagem: nada muda na sua conta.`,
        reason:
          'Você recebeu este e-mail porque ele foi cadastrado em uma conta do Bora Marca. Mensagem automática.',
      }),

    /** (b) Sent right after the address is confirmed. */
    welcome: (v: { name: string }) =>
      render(ctx, {
        subject: 'E-mail confirmado. Boas-vindas ao Bora Marca!',
        preheader: 'Pronto: seu e-mail está confirmado.',
        title: 'Tudo certo com seu e-mail',
        body: [
          `Oi, ${firstName(v.name)}!`,
          'Seu e-mail está confirmado. Por aqui você vai receber só o que importa sobre a sua conta, como avisos de segurança e comprovantes.',
          'No dia a dia, quem trabalha é o app: ele responde seus clientes no WhatsApp, marca os horários na agenda e te avisa quando precisa de você.',
        ],
        listTitle: 'Para começar bem',
        list: [
          'Confira seus serviços e horários em Ajustes',
          'Conecte o WhatsApp do seu espaço',
          'Deixe o celular no Modo Balcão para ouvir e falar com a agenda',
        ],
        note: `Precisa de ajuda? Responda este e-mail ou escreva para ${ctx.support}.`,
        reason: SELF,
      }),

    /** (c) Receipt of an account deletion: what was erased and when. */
    accountDeleted: (v: { name: string; completedAt: Date; timezone?: string }) =>
      render(ctx, {
        subject: 'Sua conta do Bora Marca foi excluída',
        preheader: 'Este é o comprovante da exclusão da sua conta e dos seus dados.',
        title: 'Conta excluída',
        body: [
          `Oi, ${firstName(v.name)}.`,
          'Como você pediu, sua conta do Bora Marca foi excluída. Este e-mail é o seu comprovante.',
        ],
        facts: [['Excluída em', formatDateTime(v.completedAt, v.timezone)]],
        listTitle: 'O que foi apagado',
        list: [
          'Seus dados de cadastro: nome, telefone, endereço e este e-mail',
          'Sua agenda, seus serviços e horários de atendimento',
          'Seus clientes, as conversas e a lista de espera',
          'A conexão com o WhatsApp e os aparelhos ligados à conta',
        ],
        note: `Guardamos só um registro da data do pedido, sem seu telefone, para provar que a exclusão foi feita (LGPD). Este endereço também já foi apagado: este é o último e-mail que você recebe da gente. Não foi você? Escreva para ${ctx.support}.`,
        reason:
          'Você recebeu este e-mail porque este endereço estava confirmado na conta excluída. Mensagem automática.',
      }),

    /** (d) Team notice: a new lead or contact message from the site form. */
    newLead: (v: {
      name: string;
      phone: string;
      profession: string | null;
      message: string | null;
      source: string;
      receivedAt: Date;
    }) => {
      const contact = v.source === 'site_contato';
      const profession =
        (v.profession && PROFESSION_LABELS[v.profession as keyof typeof PROFESSION_LABELS]) ||
        v.profession;
      return render(ctx, {
        subject: `${contact ? 'Nova mensagem pelo site' : 'Novo lead'}: ${v.name}`,
        preheader: v.message ? v.message.slice(0, 120) : `${v.name} deixou o contato no site.`,
        title: contact ? 'Nova mensagem pelo site' : 'Novo lead',
        body: [`${v.name} deixou o contato no site. Responda pelo WhatsApp.`],
        facts: [
          ['Nome', v.name],
          ['WhatsApp', v.phone],
          ...(profession ? [['Profissão', profession] as [string, string]] : []),
          ['Origem', v.source],
          ['Recebido em', formatDateTime(v.receivedAt)],
          ...(v.message ? [['Mensagem', v.message] as [string, string]] : []),
        ],
        cta: {
          label: 'Abrir conversa no WhatsApp',
          url: `https://wa.me/${v.phone.replace(/\D/g, '')}`,
        },
        reason: 'Aviso interno do Bora Marca para o time (MAIL_OPS_TO). Mensagem automática.',
      });
    },

    /** (e) 6-digit code: free sign-up or login by e-mail (works without SMS). */
    accessCode: (v: { code: string; ttlMinutes: number; purpose: 'signup' | 'login' }) =>
      render(ctx, {
        subject: `${v.code} é o seu código do Bora Marca`,
        preheader: `Digite ${v.code} no Bora Marca. Vale por ${v.ttlMinutes} minutos.`,
        title: v.purpose === 'signup' ? 'Seu código para criar a conta' : 'Seu código para entrar',
        body: [
          v.purpose === 'signup'
            ? 'Falta pouco! Digite este código no Bora Marca para criar sua conta e começar o teste grátis de 14 dias.'
            : 'Digite este código no Bora Marca para entrar na sua conta.',
        ],
        facts: [['Código', v.code]],
        note: `O código vale por ${v.ttlMinutes} minutos e só funciona uma vez. Não compartilhe com ninguém: nossa equipe nunca pede este código. Se não foi você, ignore este e-mail.`,
        reason:
          'Você recebeu este e-mail porque alguém pediu um código do Bora Marca com este endereço. Mensagem automática.',
      }),

    /** (f) Sign-up with a phone or e-mail that already has an account: no code, go to login. */
    accountExists: () =>
      render(ctx, {
        subject: 'Você já tem conta no Bora Marca',
        preheader: 'Entre com seu celular: não precisa criar outra conta.',
        title: 'Você já tem conta',
        body: [
          'Alguém tentou criar uma conta no Bora Marca com este e-mail ou com o celular informado, mas já existe uma conta com esses dados.',
          'Para entrar, abra o app ou o painel e use o seu celular. Se a conta tiver este e-mail confirmado, você pode receber o código por aqui.',
        ],
        note: `Não foi você? Pode ignorar esta mensagem: nada muda na conta. Dúvidas: ${ctx.support}.`,
        reason:
          'Você recebeu este e-mail porque ele foi informado em um cadastro do Bora Marca. Mensagem automática.',
      }),
  };
}
export type MailTemplates = ReturnType<typeof mailTemplates>;
