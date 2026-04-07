import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from '@/server/db';
import { sessions, users } from '@/server/db/schema';

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: 'auth_session',
    attributes: {
      secure: process.env.NODE_ENV === 'production',
    },
  },
  getUserAttributes(attrs) {
    return {
      email: attrs.email,
      name:  attrs.name,
      role:  attrs.role,
    };
  },
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      name:  string | null;
      role:  string | null;
    };
  }
}
