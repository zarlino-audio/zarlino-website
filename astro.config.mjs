import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://zarlinoaudio.com',
  integrations: [
    react(),
    tailwind(),
    sitemap({
      filter: (page) => !page.includes('/404') && !page.includes('/admin'),
    }),
  ],
  output: 'static',
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
