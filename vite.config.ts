import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Content Security Policy, as a meta tag in the built index.html.
 *
 * Defence in depth: should a script ever be injected (a compromised
 * dependency, an XSS nobody has found), the browser refuses to run anything
 * that is not our own bundle and refuses to send data anywhere but Firebase.
 * The list of hosts is exactly what the app talks to; add here before adding
 * a new network call, or that call fails in production.
 *
 * Checked against the Firebase SDK: anonymous sign-in and Firestore use only
 * the three hosts below. Turning on reCAPTCHA Enterprise protection for Auth
 * in the Firebase console would load a script from www.google.com, which
 * this policy blocks until it is added here.
 *
 * Build only. The dev server injects its own inline scripts for hot reload,
 * which this policy would block.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React sets a few inline style attributes (avatar colours); attributes
  // cannot carry a nonce, so inline styles stay allowed. Inline *scripts*
  // are not, and that is the part that matters.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Firestore (data), Identity Toolkit (anonymous sign-in) and Secure Token
  // (refreshing that sign-in). Nothing else.
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'tripsplit:csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// `base` matters for GitHub Pages, where the app is served from
// https://<user>.github.io/<repo>/ rather than the domain root.
// Set BASE_PATH at build time; defaults to '/' for Netlify/Vercel/local.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'TripSplit — share trip expenses',
        short_name: 'TripSplit',
        description:
          'Split trip expenses with friends. Works fully offline, no account needed.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The whole app must work with the phone in airplane mode, so every
        // build artifact is precached. There are no network calls at runtime.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
