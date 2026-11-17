import { ArrowLeft } from "lucide-react";
import { LinkButton } from "@/components/ui";

/** "← Back" button for detail and import pages (a fixed target, so it works after a reload or from a shared link). */
export function BackLink({ href, children = "Quay lại" }: { href: string; children?: React.ReactNode }) {
  return (
    <LinkButton href={href} variant="outline" size="sm">
      <ArrowLeft className="h-4 w-4" /> {children}
    </LinkButton>
  );
}
