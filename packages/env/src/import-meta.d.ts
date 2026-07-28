interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
