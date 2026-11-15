/** Public site settings (NEXT_PUBLIC_* are embedded at build time; see .env.example). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://boramarca.com.br').replace(
  /\/$/,
  '',
);
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(
  /\/$/,
  '',
);
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'contato@boramarca.com.br';
export const PLAY_URL = process.env.NEXT_PUBLIC_PLAY_URL || '';
export const APPSTORE_URL = process.env.NEXT_PUBLIC_APPSTORE_URL || '';

export const SITE_NAME = 'Bora Marca';
export const SITE_DESCRIPTION =
  'Agenda inteligente para profissionais que vivem de hora marcada: WhatsApp, agenda e voz trabalhando com você.';

export const NAV = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#recursos', label: 'Recursos' },
  { href: '/#modo-balcao', label: 'Modo Balcão' },
  { href: '/#duvidas', label: 'Dúvidas' },
] as const;

export const LEGAL_LINKS = [
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/termos', label: 'Termos' },
  { href: '/contato', label: 'Contato' },
  { href: '/excluir-conta', label: 'Excluir conta' },
] as const;

/** Pages listed in sitemap.xml. */
export const PAGES = ['/', '/contato', '/privacidade', '/termos', '/excluir-conta'] as const;
