/// <reference types="vite/client" />

/**
 * vite-env.d.ts
 * ---------------------------------------------------------------
 * Types for the build-time environment variables this app reads.
 *
 * The reference above is what makes `import.meta.env` exist at all — the root
 * tsconfig.json has no `types` array, so without this line `npm run lint`
 * fails on every use of it with "Property 'env' does not exist on type
 * 'ImportMeta'". Declaring the shape as well means a typo in a variable name is
 * caught by the compiler instead of surfacing as `undefined` at runtime, where
 * the app would quietly fall back to same-origin and fail to reach the API.
 *
 * Only VITE_-prefixed variables are exposed to the browser, and that prefix is
 * doing real work: it is what keeps DATABASE_URL and SESSION_SECRET out of the
 * bundle even when they are present in the shell that runs the build. Nothing
 * secret belongs in this file, because everything in it ships to the client in
 * plain text.
 */
interface ImportMetaEnv {
  /**
   * Absolute origin of the BECS API, e.g. https://becs-hvac-api.onrender.com.
   *
   * Leave it unset for a same-origin deployment — the backend's SERVE_FRONTEND
   * mode serves this bundle and the API from one process, where a relative path
   * is correct and a hardcoded origin would break it. Set it on Vercel, where
   * the two are on different hosts.
   *
   * No trailing slash; api.ts strips one if present.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
