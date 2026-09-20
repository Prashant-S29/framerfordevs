interface ImportMetaEnv {
  readonly VITE_DASHBOARD_ORIGIN?: string;
  readonly VITE_DEVELOPER_ORIGIN?: string;
  readonly VITE_MARKETING_ORIGIN?: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
