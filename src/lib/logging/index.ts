import { redact } from "./redact";

export type RedactedLogger = {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

export function createRedactedLogger(): RedactedLogger {
  function makeMethod(method: (...args: unknown[]) => void) {
    return (...args: unknown[]) => {
      method(...args.map((arg) => redact(arg)));
    };
  }

  return {
    log: makeMethod(console.log),
    info: makeMethod(console.info),
    warn: makeMethod(console.warn),
    error: makeMethod(console.error),
    debug: makeMethod(console.debug),
  };
}

export { redact } from "./redact";
