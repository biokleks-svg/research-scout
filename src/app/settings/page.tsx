import { redirect } from 'next/navigation';
import { lucia } from '@/lib/auth';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { systemSettings } from '@/server/db/schema';
import { SettingsForm } from '@/components/settings/SettingsForm';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const sessionId   = lucia.readSessionCookie(cookieStore.toString());
  if (!sessionId) redirect('/login');
  const { user } = await lucia.validateSession(sessionId);
  if (!user) redirect('/login');

  const rows    = await db.select().from(systemSettings);
  const current = Object.fromEntries(rows.map(r => [r.key, r.value]));

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Pipeline Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Control cost and behavior of the offline processing pipeline.</p>
      </div>
      <SettingsForm current={current} />
    </main>
  );
}
