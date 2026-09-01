// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// astro.config gira prima che Astro popoli import.meta.env: senza loadEnv il
// valore in .env verrebbe ignorato e `site` resterebbe al default, sporcando
// canonical, Open Graph e sitemap.
const { PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

export default defineConfig({
  site: (PUBLIC_SITE_URL || 'https://netunim.com').replace(/\/$/, ''),
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'directory' },
  integrations: [
    react(),
    // Fuori dalla sitemap le pagine marcate noindex: styleguide e 404.
    sitemap({
      filter: (page) => !/\/(styleguide|404)\/?$/.test(page),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
