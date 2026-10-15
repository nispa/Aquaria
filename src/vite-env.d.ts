/** Build-time configuration read from VITE_* environment variables. */
interface ImportMetaEnv {
  /** Render height (pixels) the app starts at until the viewer saves one; 4K when unset. */
  readonly VITE_DEFAULT_RENDER_HEIGHT?: string;
}

/** Injected by vite.config.ts at build time. */
interface ImportMetaEnv {
  /** The release, from package.json (SemVer). */
  readonly APP_VERSION: string;
  /** Short hash of the commit the build was made from; empty when unknown. */
  readonly APP_COMMIT: string;
}
