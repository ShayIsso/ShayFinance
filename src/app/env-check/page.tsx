import { redirect } from "next/navigation";
import { EnvDiagnostic } from "@/components/env-diagnostic";
import { checkBootEnv } from "@/lib/env";

/**
 * Must be evaluated per request: the production image is built with no
 * environment at all, so a prerendered copy of this page would name variables
 * from build time and keep naming them after the operator fixed one.
 */
export const dynamic = "force-dynamic";

/**
 * The route the middleware rewrites every request to while the environment is
 * unusable (ADR-0014 §1). It reads `process.env` and nothing else — no database
 * query, no session, no cookie — because neither a database nor a session
 * exists in the failure it reports. A refactor that adds any of them turns this
 * page into the same 500 it exists to replace.
 *
 * Reachable directly, so it redirects out once the environment is valid rather
 * than claiming a problem that no longer exists.
 */
export default function EnvCheckPage() {
  const bootEnv = checkBootEnv(process.env);
  if (bootEnv.ok) redirect("/");

  return <EnvDiagnostic problems={bootEnv.problems} />;
}
