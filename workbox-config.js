module.exports = {
  globDirectory: 'build/',
  globPatterns: [
    '**/*.{html,js,css,png,svg,jpg,jpeg,gif,ico,woff,woff2,ttf,eot}'
  ],
  ignoreURLParametersMatching: [
    /^utm_/,
    /^fbclid$/
  ],
  swDest: 'build/sw.js',
  clientsClaim: true,
  skipWaiting: true,
  cleanupOutdatedCaches: true,
  offlineGoogleAnalytics: true,
  
  // 런타임 캐싱 설정
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/apis\.openapi\.sk\.com\//,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'tmap-api-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 300, // 5분
        },
        cacheKeyWillBeUsed: async ({ request }) => {
          return `${request.url}&timestamp=${Math.floor(Date.now() / 300000)}`;
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-api-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 86400, // 1일
        },
      },
    },
    {
      urlPattern: /\.(?:png|gif|jpg|jpeg|svg)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30일
        },
      },
    },
    {
      urlPattern: /\.(?:js|css)$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-resources',
      },
    },
  ],
  
  // 매니페스트 변환
  manifestTransforms: [
    (manifestEntries) => {
      const manifest = manifestEntries.map((entry) => {
        if (entry.url.endsWith('.html')) {
          entry.url = entry.url.replace(/\.html$/, '');
        }
        return entry;
      });
      return { manifest };
    },
  ],
};