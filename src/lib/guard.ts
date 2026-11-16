import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { can, type Capability } from "./rbac";

/** Section-level guard for segment layouts: redirect to the dashboard when the role lacks the capability. */
export async function requireCapability(capability: Capability) {
  const user = await requireUser();
  if (!can(user.role, capability)) redirect("/dashboard");
  return user;
}
