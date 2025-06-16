module.exports = {
  globDirectory: 'build/',
  globPatterns: [
    '**/*.{js,css,html,png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot}'
  ],
  swDest: 'build/service-worker.js',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.example\.com\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        cacheKeyWillBeUsed: async ({request}) => {
          const url = new URL(request.url);
          
          // 기존 쿼리 파라미터가 있는지 확인
          const hasQuery = url.search.length > 0;
          
          // timestamp 파라미터 추가 (올바른 구분자 사용)
          const separator = hasQuery ? '&' : '?';
          const timestampedUrl = `${url.origin}${url.pathname}${url.search}${separator}timestamp=${Date.now()}`;
          
          return timestampedUrl;
        },
        networkTimeoutSeconds: 3,
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    }
  ]
};