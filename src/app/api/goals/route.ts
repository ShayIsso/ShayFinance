import { NextResponse } from "next/server";
import { getGoalStatuses, computeGoalPaceVerdict } from "@/lib/goals";

// paceVerdict is derived here, not on the client: the pure derivation lives
// in goals/progress.ts, which imports @/lib/analytics — a DB-backed barrel —
// so pulling it into the client bundle would drag postgres along (same
// constraint as actions/goals.ts's targetAmount derivation).
export async function GET() {
  const statuses = await getGoalStatuses();
  const data = statuses.map((s) => ({
    id: s.goal.id,
    name: s.goal.name,
    startMonth: s.goal.startMonth,
    targetMonth: s.goal.targetMonth,
    current: s.current,
    target: s.target,
    remaining: s.remaining,
    expected: s.expected,
    paceVerdict: computeGoalPaceVerdict(s.current, s.expected),
  }));
  return NextResponse.json(data);
}
