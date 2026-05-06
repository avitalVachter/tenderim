import { cn } from "@/lib/utils";

type EyebrowProps = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "span" | "p";
};

/**
 * Small uppercase letter-spaced label that establishes hierarchy without
 * requiring extra vertical space. Place above page titles, hero numbers,
 * and email headers. See DESIGN_HANDOFF.md §"Typography".
 */
export function Eyebrow({ children, className, as: Tag = "div" }: EyebrowProps) {
  return <Tag className={cn("eyebrow", className)}>{children}</Tag>;
}
