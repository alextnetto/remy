"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Render a back button that calls router.back(). */
  back?: boolean;
  /** Trailing slot (actions). */
  action?: ReactNode;
  /** Leading slot (e.g. an avatar), shown when not using `back`. */
  leading?: ReactNode;
  className?: string;
}

/**
 * Sticky top app bar for the mobile frame. Translucent + blurred so list
 * content scrolls underneath it.
 */
export function AppHeader({
  title,
  subtitle,
  back = false,
  action,
  leading,
  className,
}: AppHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/65",
        className,
      )}
    >
      {back ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          onClick={() => router.back()}
          className="-ml-1 shrink-0"
        >
          <ChevronLeft className="size-5" />
        </Button>
      ) : leading ? (
        <div className="shrink-0">{leading}</div>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-lg leading-tight font-semibold">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
