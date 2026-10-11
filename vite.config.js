import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      ignored: ['**/alarmsounds/**'],
    },
    proxy: {
      '/api/pagasa-weather': {
        target: 'https://pagasa.dost.gov.ph',
        changeOrigin: true,
        rewrite: () => '/api/NearestAWS',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.setHeader('Accept', 'application/json, text/javascript, */*; q=0.01');
            proxyRequest.setHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            proxyRequest.setHeader('Origin', 'https://pagasa.dost.gov.ph');
            proxyRequest.setHeader('Referer', 'https://pagasa.dost.gov.ph/');
            proxyRequest.setHeader('Sec-Fetch-Dest', 'empty');
            proxyRequest.setHeader('Sec-Fetch-Mode', 'cors');
            proxyRequest.setHeader('Sec-Fetch-Site', 'same-origin');
            proxyRequest.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.250 Safari/537.36');
            proxyRequest.setHeader('X-Requested-With', 'XMLHttpRequest');
          });
        },
      },
    },
  },
});
