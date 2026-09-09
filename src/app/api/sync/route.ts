export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { syncAllBanksClaimed } from "@/lib/sync";

export async function GET() {
  // Checked — and refused — before the stream is ever constructed, so a
  // second concurrent invocation gets a normal 409 response instead of a
  // 200 that then errors mid-stream (#246).
  const events = syncAllBanksClaimed();
  if (events === null) {
    return NextResponse.json({ error: "סנכרון כבר פועל" }, { status: 409 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          // Strip internal fields before sending to client
          const { _credentialId, ...rest } = event as typeof event & { _credentialId?: string };

          if (rest.type === "otp_required") {
            // Never send otpHandler to the client
            const { otpHandler: _handler, ...clientEvent } = rest as typeof rest & {
              otpHandler?: unknown;
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(clientEvent)}\n\n`));
            continue;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(rest)}\n\n`));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by cancel() below (client disconnected) — nothing to do.
        }
      }
    },
    cancel() {
      // A client disconnect (tab closed, navigation) tears this stream down
      // mid-iteration without the loop above ever reaching its finally
      // naturally. Forcing `.return()` resumes the generator at its current
      // yield as a return, unwinding through syncAllBanksClaimed's finally —
      // same path as a normal finish — so the claim still gets released
      // instead of leaking until process restart.
      void events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
