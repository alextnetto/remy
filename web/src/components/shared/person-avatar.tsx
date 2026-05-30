"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { avatarGradient, initials } from "./format";

interface PersonAvatarProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}

/**
 * Person avatar with a deterministic gradient initials fallback. The gradient
 * is keyed off the person id so it's stable across renders.
 */
export function PersonAvatar({
  id,
  name,
  avatarUrl,
  size = "default",
  className,
}: PersonAvatarProps) {
  return (
    <Avatar size={size} className={cn("ring-1 ring-black/5", className)}>
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt={name} />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-gradient-to-br font-semibold text-white",
          avatarGradient(id),
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
