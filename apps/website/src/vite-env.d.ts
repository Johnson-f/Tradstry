/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STYTCH_PUBLIC_TOKEN?: string
  readonly VITE_STYTCH_DOMAIN?: string
  readonly VITE_STYTCH_IDP_DOMAIN?: string
  readonly VITE_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
