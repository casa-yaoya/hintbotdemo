export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  ssr: false,


  future: {
    compatibilityVersion: 4,
  },

  dir: {
    public: '../public',
  },

  app: {
    head: {
      link: [
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap',
        },
      ],
    },
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
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || '',
    },
  },
})
