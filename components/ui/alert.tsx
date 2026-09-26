import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type AlertTone = "info" | "success" | "error" | "warning";

const TONES: Record<AlertTone, { box: string; Icon: typeof Info }> = {
  info: { box: "border-line bg-accent-soft text-foreground", Icon: Info },
  success: { box: "border-success/30 bg-success-soft text-foreground", Icon: CheckCircle2 },
  error: { box: "border-danger/30 bg-danger-soft text-foreground", Icon: AlertTriangle },
  warning: { box: "border-line bg-surface text-foreground", Icon: AlertTriangle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-4 text-sm", box, className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "error" && "text-danger", tone === "success" && "text-success")} />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}
