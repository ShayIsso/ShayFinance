import type { OtpHandler } from "./types";

const OTP_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export function createOtpBridge(): OtpHandler {
  let resolveOtp!: (code: string) => void;
  let rejectOtp!: (err: Error) => void;
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<string>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("OTP_TIMEOUT"));
    }, OTP_TIMEOUT_MS);

    resolveOtp = (code: string) => {
      clearTimeout(timeoutId);
      resolve(code);
    };

    rejectOtp = reject;
  });

  // Suppress unhandled rejection if promise is never awaited
  promise.catch(() => {});

  function cancel() {
    clearTimeout(timeoutId);
  }

  /** Immediately reject with OTP_TIMEOUT — used by scheduled runs to skip banks that require OTP. */
  function skip() {
    clearTimeout(timeoutId);
    rejectOtp(new Error("OTP_TIMEOUT"));
  }

  return { resolveOtp, promise, cancel, skip };
}
