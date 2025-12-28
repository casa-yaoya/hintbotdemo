export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  // GitHub Pages用の設定
  ssr: false,
  app: {
    baseURL: '/hintbotdemo/',
  },

  future: {
    compatibilityVersion: 4,
  },

  dir: {
    public: '../public',
  },

  modules: [
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxt/eslint',
    '@vueuse/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  icon: {
    serverBundle: 'remote',
  },

  runtimeConfig: {
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
})
