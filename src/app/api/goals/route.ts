import { NextResponse } from "next/server";
import { getGoalLadder } from "@/lib/goals";

// The ladder (capped fill, pace verdict, surplus) is derived here, not on the
// client: the pure ladder core imports @/lib/goals/progress → @/lib/analytics, a
// DB-backed barrel, so pulling it into the client bundle would drag postgres
// along (same constraint as actions/goals.ts's targetAmount derivation).
export async function GET() {
  const ladder = await getGoalLadder();
  return NextResponse.json({
    surplus: ladder.surplus,
    goals: ladder.rungs.map((rung) => ({
      id: rung.goal.id,
      name: rung.goal.name,
      current: rung.current,
      target: rung.target,
      paceVerdict: rung.paceVerdict,
    })),
  });
}
