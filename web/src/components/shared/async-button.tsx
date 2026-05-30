"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

interface AsyncButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Async click handler; the button shows a spinner + disables while it runs. */
  onClick?: () => void | Promise<void>;
  /** Optional override for the busy state (e.g. driven by parent). */
  pending?: boolean;
}

/**
 * Button that manages its own pending state for an async onClick, swapping its
 * content for a spinner and preventing double-submits.
 */
export function AsyncButton({
  onClick,
  pending: pendingProp,
  disabled,
  children,
  ...props
}: AsyncButtonProps) {
  const [pending, setPending] = React.useState(false);
  const busy = pendingProp ?? pending;

  async function handleClick() {
    if (!onClick || busy) return;
    try {
      setPending(true);
      await onClick();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      {...props}
      disabled={disabled || busy}
      onClick={onClick ? handleClick : undefined}
    >
      {busy ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
