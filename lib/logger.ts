import { currentRequestId } from "./requestContext";

export type LogLevel = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SEVERITY: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

// Values of these fields are never logged.
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase() as keyof typeof SEVERITY | undefined;
  return SEVERITY[configured ?? "info"] ?? SEVERITY.info;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function sanitize(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) out[key] = "[redacted]";
    else if (key === "err" || key === "error") out.err = serializeError(value);
    else out[key] = value;
  }
  return out;
}

export type LogSink = (line: string) => void;
let sink: LogSink = (line) => process.stdout.write(line + "\n");

// Tests swap the output. Production writes to stdout.
export function setLogSink(next: LogSink | null) {
  sink = next ?? ((line) => process.stdout.write(line + "\n"));
}

function log(level: LogLevel, msg: string, fields: Fields = {}) {
  if (SEVERITY[level] < threshold()) return;
  const requestId = currentRequestId();
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(requestId ? { requestId } : {}),
    ...sanitize(fields),
  };
  sink(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, fields?: Fields) => log("debug", msg, fields),
  info: (msg: string, fields?: Fields) => log("info", msg, fields),
  warn: (msg: string, fields?: Fields) => log("warn", msg, fields),
  error: (msg: string, fields?: Fields) => log("error", msg, fields),
};
