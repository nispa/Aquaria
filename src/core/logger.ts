export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

/** Creates a logger that tags every entry with a scope (e.g. "scene", "render"). */
export function createLogger(scope: string, sink: LogSink): Logger {
  const write =
    (level: LogLevel) =>
    (message: string, details?: Record<string, unknown>): void => {
      sink(details === undefined ? { level, scope, message } : { level, scope, message, details });
    };

  return { info: write("info"), warn: write("warn"), error: write("error") };
}

/** Default sink for the browser console. The only place allowed to use console. */
export const consoleSink: LogSink = (entry) => {
  const text = `[${entry.scope}] ${entry.message}`;
  // eslint-disable-next-line no-console -- this sink is the logger's single console gateway
  console[entry.level](text, entry.details ?? "");
};
