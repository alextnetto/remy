import {
  AtSign,
  Camera,
  Globe,
  Hash,
  Link2,
  type LucideIcon,
  Mail,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react";

import type { ContactKind } from "@/lib/types";

// NOTE: lucide-react dropped the Instagram/LinkedIn/Twitter brand glyphs, so we
// map socials to neutral, visually-distinct icons instead.
const ICONS: Record<ContactKind, LucideIcon> = {
  phone: Phone,
  email: Mail,
  website: Globe,
  linkedin: AtSign,
  instagram: Camera,
  x: Hash,
  whatsapp: MessageCircle,
  telegram: Send,
  other: Link2,
};

export function ContactIcon({
  kind,
  className,
}: {
  kind: ContactKind;
  className?: string;
}) {
  const Icon = ICONS[kind] ?? AtSign;
  return <Icon className={className} aria-hidden />;
}
