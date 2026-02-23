// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    // @ts-ignore - version mismatch between @tailwindcss/vite and astro's bundled vite types
    plugins: [tailwindcss()],
  },
});
