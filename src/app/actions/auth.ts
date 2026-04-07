'use server';

import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { lucia } from '@/lib/auth';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export type AuthActionState = { error: string } | null;

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(1).optional(),
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = RegisterSchema.safeParse({
    email:    formData.get('email'),
    password: formData.get('password'),
    name:     formData.get('name') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input' };

  const { email, password, name } = parsed.data;
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: 'Email already registered' };

  const [newUser] = await db.insert(users).values({ email, passwordHash, name: name ?? null }).returning({ id: users.id });
  if (!newUser) return { error: 'Registration failed' };

  const session       = await lucia.createSession(newUser.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
  redirect('/');
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = LoginSchema.safeParse({
    email:    formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Invalid input' };

  const { email, password } = parsed.data;
  const [existingUser] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!existingUser?.passwordHash) return { error: 'Invalid email or password' };

  const valid = await verify(existingUser.passwordHash, password);
  if (!valid) return { error: 'Invalid email or password' };

  const session       = await lucia.createSession(existingUser.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
  redirect('/');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const sessionId   = cookieStore.get('auth_session')?.value;
  if (sessionId) {
    await lucia.invalidateSession(sessionId);
    const blankCookie = lucia.createBlankSessionCookie();
    cookieStore.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
  }
  redirect('/login');
}
