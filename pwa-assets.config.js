import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const brandBackground = { fit: 'contain', background: '#087f75' };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  images: ['public/favicon.svg'],
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: brandBackground },
    apple: { ...minimal2023Preset.apple, resizeOptions: brandBackground },
  },
});
