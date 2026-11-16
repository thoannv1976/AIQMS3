import { prisma } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

// SHOW_DEMO_ACCOUNTS=false hides the demo-account hint (pilot/production instances).
export default async function LoginPage() {
  const showDemo = (process.env.SHOW_DEMO_ACCOUNTS ?? "true").toLowerCase() !== "false";
  const uni = await prisma.university.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true } }).catch(() => null);
  return <LoginForm orgName={uni?.name ?? null} showDemo={showDemo} />;
}
