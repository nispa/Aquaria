/** Build-time configuration read from VITE_* environment variables. */
interface ImportMetaEnv {
  /** Render height (pixels) the app starts at until the viewer saves one; 4K when unset. */
  readonly VITE_DEFAULT_RENDER_HEIGHT?: string;
}
