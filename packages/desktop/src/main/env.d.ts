interface ImportMetaEnv {
  readonly PORKCODE_CHANNEL: string
  readonly PORKCODE_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
