import { Linking } from 'react-native';
import { showToast } from '@/components/Toast';

/** Public site (apps/web). `EXPO_PUBLIC_SITE_URL` per build profile; production by default. */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://boramarca.com.br').replace(
  /\/+$/,
  '',
);

export const SITE_PAGES = {
  privacy: '/privacidade',
  terms: '/termos',
  deleteAccount: '/excluir-conta',
  contact: '/contato',
  plans: '/#planos',
} as const;

export const siteUrl = (page: keyof typeof SITE_PAGES) => `${SITE_URL}${SITE_PAGES[page]}`;

/** Opens a site page in the browser. */
export function openSite(page: keyof typeof SITE_PAGES) {
  Linking.openURL(siteUrl(page)).catch(() =>
    showToast('Não deu para abrir o navegador.', 'danger'),
  );
}
