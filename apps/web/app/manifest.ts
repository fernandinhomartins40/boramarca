import type { MetadataRoute } from 'next';
import { brand } from '@boramarca/shared/theme';

// Installable panel ("Adicionar à tela inicial"): opens straight in the panel, without the browser bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bora Marca — Painel',
    short_name: 'Bora Marca',
    description: 'Agenda, clientes e equipe do seu espaço.',
    lang: 'pt-BR',
    start_url: '/painel',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: brand.neutro,
    theme_color: brand.grafite,
    icons: [
      { src: '/app/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/app/icone-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
