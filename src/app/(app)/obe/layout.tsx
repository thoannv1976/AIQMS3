import { requireCapability } from "@/lib/guard";

export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  await requireCapability("obe:view");
  return children;
}
