import { env } from "@framerfordevs/env/server";
import { Context, Effect, Layer } from "effect";

export type LogFields = Readonly<Record<string, unknown>>;

export interface LogRecord {
  readonly level: "info" | "error";
  readonly message: string;
  readonly fields: LogFields;
}

const sensitiveKeyPattern =
  /authorization|cookie|password|secret|token|database.?url|body|content|payload/i;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+\x2f-]+=*/gi;
const databaseUrlPattern = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s,;]+/gi;
const urlCredentialsPattern = /([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi;
const assignmentPattern = /\b(password|secret|token|cookie|authorization)=([^\s,;]+)/gi;
const sqlPattern =
  /\b(?:select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from|alter\s+table|create\s+table|drop\s+table)\b[^;]*/gi;

export function redactString(value: string): string {
  const bounded = value.length > 4_096 ? `${value.slice(0, 4_096)}[TRUNCATED]` : value;
  return bounded
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(databaseUrlPattern, "[REDACTED_DATABASE_URL]")
    .replace(urlCredentialsPattern, "$1[REDACTED]@")
    .replace(assignmentPattern, "$1=[REDACTED]")
    .replace(sqlPattern, "[REDACTED_SQL]");
}

export function redactValue(value: unknown, key = "", depth = 0): unknown {
  if (sensitiveKeyPattern.test(key)) return "[REDACTED]";
  if (depth >= 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactValue(item, "", depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([entryKey, entryValue]) => [entryKey, redactValue(entryValue, entryKey, depth + 1)]),
    );
  }
  return `[${typeof value}]`;
}

export function redactFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, redactValue(value, key)]),
  );
}

export function sanitizeCause(cause: unknown): unknown {
  if (Array.isArray(cause)) return cause.slice(0, 20).map(sanitizeCause);
  if (cause instanceof Error || typeof cause === "string") return redactValue(cause, "cause");
  if (cause === null) return null;
  return { type: typeof cause };
}

export class ApplicationLogger extends Context.Tag("ApplicationLogger")<
  ApplicationLogger,
  {
    readonly info: (message: string, fields?: LogFields) => Effect.Effect<void>;
    readonly error: (message: string, fields?: LogFields) => Effect.Effect<void>;
  }
>() {}

export const ApplicationLoggerLive = Layer.succeed(ApplicationLogger, {
  info: (message, fields = {}) =>
    env.NODE_ENV === "test" || env.APPLICATION_LOG_LEVEL === "error"
      ? Effect.void
      : Effect.logInfo(message, redactFields(fields)),
  error: (message, fields = {}) =>
    env.NODE_ENV === "test" ? Effect.void : Effect.logError(message, redactFields(fields)),
});
