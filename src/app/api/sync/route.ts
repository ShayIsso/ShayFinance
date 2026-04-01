export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { syncAllBanks } from "@/lib/sync";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of syncAllBanks()) {
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
        controller.close();
      }
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
