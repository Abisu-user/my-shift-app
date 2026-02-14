import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: '排班小幫手',
        short_name: '排班表',
        description: '簡易好用的員工排班系統',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'favicon-ios.png',
            sizes: '76x76',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})