import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "aiqms_session";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-insecure-secret-change-me");
}

function sessionDays(): number {
  return parseInt(process.env.AUTH_SESSION_DAYS || "7", 10);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionDays()}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionDays() * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return (payload.uid as string) ?? null;
  } catch {
    return null;
  }
}

// Cached per request so repeated calls (e.g. requireUser + resolveProgram) hit the DB once.
export const getCurrentUser = cache(async () => {
  const uid = await getSessionUserId();
  if (!uid) return null;
  const user = await prisma.user.findUnique({
    where: { id: uid },
    include: { department: { include: { faculty: true } } },
  });
  if (!user || !user.isActive) return null;
  return user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
