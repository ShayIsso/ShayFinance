import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BootEnvProblem, BootEnvVariable } from "@/lib/env";

/**
 * The boot-failure diagnostic (ADR-0014 §1). Rendered by the root layout in
 * place of the page whenever the boot preflight fails.
 *
 * This must render with no database connection and no session — neither is
 * available in the failure it reports, since the failing variable is either the
 * database URL itself or the key that decrypts what the database holds. Keep it
 * free of data fetching, cookies and client state: a refactor that adds any of
 * them turns this page into the same 500 it exists to replace.
 *
 * It names variables and commands only. No value — not a prefix, not a length —
 * may reach this markup (zero-leak policy).
 */
const PURPOSE: Record<BootEnvVariable, string> = {
  DATABASE_URL:
    "כתובת החיבור למסד הנתונים. הריצו את מסד הנתונים המקומי והעתיקו את כתובת החיבור שלו.",
  ENCRYPTION_KEY:
    "המפתח שמצפין את פרטי ההתחברות לבנקים בתוך מסד הנתונים. צרו מפתח חדש והעתיקו אותו.",
};

export function EnvDiagnostic({ problems }: { problems: readonly BootEnvProblem[] }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-muted-foreground h-6 w-6 shrink-0" strokeWidth={1.5} />
            <CardTitle className="text-lg">חסרה הגדרת סביבה</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="text-muted-foreground flex flex-col gap-1 text-sm">
            <p>
              האפליקציה לא יכולה לעלות עד שהמשתנים הבאים יוגדרו בקובץ <Code>.env</Code>
            </p>
            <p>לאחר ההגדרה, הפעילו את השרת מחדש.</p>
          </div>

          <ul className="flex flex-col gap-5">
            {problems.map((problem) => (
              <li key={problem.variable} className="flex flex-col gap-2">
                <Code className="self-start">{problem.variable}</Code>
                <p className="text-muted-foreground text-sm">{PURPOSE[problem.variable]}</p>
                <pre
                  dir="ltr"
                  className="bg-muted text-foreground overflow-x-auto rounded-md px-3 py-2 font-mono text-xs"
                >
                  <code>{problem.generateCommand}</code>
                </pre>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

/** Variable names and file names are Latin-script identifiers, so they stay LTR inside the RTL page. */
function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code
      dir="ltr"
      className={`bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs ${className ?? ""}`}
    >
      {children}
    </code>
  );
}
