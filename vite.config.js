import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' for Capacitor (mobile app), '/convoautopsy/' for GitHub Pages
const isCapacitor = process.env.VITE_CAPACITOR === 'true'

export default defineConfig({
  plugins: [react()],
  base: isCapacitor ? './' : '/convoautopsy/',
})
