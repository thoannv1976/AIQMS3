import { prisma } from "./db";

/** Create an in-app notification (best-effort; never throws into the caller). */
export async function createNotification(input: {
  userId: string | null | undefined;
  title: string;
  message?: string | null;
  link?: string | null;
}): Promise<void> {
  if (!input.userId) return;
  try {
    await prisma.notification.create({
      data: { userId: input.userId, title: input.title, message: input.message ?? null, link: input.link ?? null },
    });
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}
