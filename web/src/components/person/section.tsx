import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SectionProps {
  icon: LucideIcon;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

/**
 * A titled card section on the person detail screen. Consistent header with an
 * icon, optional count, and a trailing action (usually an "add" button).
 */
export function Section({
  icon: Icon,
  title,
  count,
  action,
  children,
  className,
  id,
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-3 shadow-sm",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {typeof count === "number" && count > 0 ? (
          <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        ) : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
