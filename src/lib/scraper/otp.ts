import type { OtpHandler } from "./types";

const OTP_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export function createOtpBridge(): OtpHandler {
  let resolveOtp!: (code: string) => void;
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<string>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("OTP_TIMEOUT"));
    }, OTP_TIMEOUT_MS);

    resolveOtp = (code: string) => {
      clearTimeout(timeoutId);
      resolve(code);
    };
  });

  // Suppress unhandled rejection if promise is never awaited
  promise.catch(() => {});

  function cancel() {
    clearTimeout(timeoutId);
  }

  return { resolveOtp, promise, cancel };
}
