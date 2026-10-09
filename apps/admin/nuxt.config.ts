// Админка — SPA: рендерится в браузере, серверного рендера нет.
export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxt/ui', '@vueuse/nuxt'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-06-30',

  // Windows: без этого Nitro не встраивает рантайм Nuxt и рендерер получает пустой манифест.
  nitro: { externals: { inline: ['nuxt', '@nuxt/nitro-server'] } },

  runtimeConfig: {
    // Адрес API для серверного прокси (server/routes/cms-api). Читается при запуске, а не при сборке:
    // одна сборка работает в любом окружении, адрес задаётся переменной NUXT_API_URL.
    apiUrl: 'http://localhost:3000',
    public: {
      // Префикс, под которым браузер обращается к API (на том же origin: нет CORS и cookie между доменами).
      apiBase: '/cms-api'
    }
  }
})
