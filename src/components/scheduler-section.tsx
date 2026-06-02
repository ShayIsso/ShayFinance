"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveSchedulerConfigAction } from "@/app/actions/scheduler";

type SchedulerConfig = {
  enabled: boolean;
  cronTime: string;
};

type Props = {
  initialConfig: SchedulerConfig;
};

export function SchedulerSection({ initialConfig }: Props) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [cronTime, setCronTime] = useState(initialConfig.cronTime);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);

    const result = await saveSchedulerConfigAction({ enabled, cronTime });

    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
    } else {
      setStatus("saved");
    }

    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">סנכרון אוטומטי יומי</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          הגדר סנכרון אוטומטי חד-יומי. שינויים ייכנסו לתוקף בהפעלה הבאה של האפליקציה.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <Checkbox
            id="scheduler-enabled"
            checked={enabled}
            onCheckedChange={(checked) => {
              setEnabled(checked === true);
              setStatus("idle");
            }}
          />
          <Label htmlFor="scheduler-enabled">הפעל סנכרון אוטומטי</Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cron-time">שעת סנכרון</Label>
          <Input
            id="cron-time"
            type="time"
            value={cronTime}
            onChange={(e) => {
              setCronTime(e.target.value);
              setStatus("idle");
            }}
            className="w-36"
            disabled={!enabled}
          />
          <p className="text-muted-foreground text-xs">
            בנקים הדורשים קוד OTP ידולגו אוטומטית בסנכרון המתוזמן.
          </p>
        </div>

        {status === "error" && errorMessage && (
          <p className="text-destructive text-sm">{errorMessage}</p>
        )}

        {status === "saved" && (
          <p className="text-sm text-emerald-600">ההגדרות נשמרו. ייכנסו לתוקף בהפעלה הבאה.</p>
        )}

        <Button type="submit" disabled={saving} size="sm">
          {saving ? "שומר..." : "שמור"}
        </Button>
      </form>
    </div>
  );
}
