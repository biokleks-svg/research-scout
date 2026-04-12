import { AdminActions } from '@/components/admin/AdminActions';
import { redirect } from 'next/navigation';
import { lucia } from '@/lib/auth';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { contentItems, trends, users } from '@/server/db/schema';
import { sql, count } from 'drizzle-orm';

export const revalidate = 60;

export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionId   = lucia.readSessionCookie(cookieStore.toString());
  if (!sessionId) redirect('/login');
  const { user } = await lucia.validateSession(sessionId);
  if (!user || user.role !== 'admin') redirect('/');

  const [statusCounts, sourceCounts, trendsCount, usersCount, recentItems] = await Promise.all([
    db.execute(sql`
      SELECT processing_status AS status, COUNT(*)::int AS count
      FROM content_items GROUP BY processing_status ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT source_type AS "sourceType", COUNT(*)::int AS count
      FROM content_items GROUP BY source_type ORDER BY count DESC
    `),
    db.select({ count: count() }).from(trends),
    db.select({ count: count() }).from(users),
    db.query.contentItems.findMany({
      orderBy: (t, { desc }) => [desc(t.harvestedAt)],
      limit: 10,
      columns: { id: true, title: true, sourceType: true, processingStatus: true, harvestedAt: true },
    }),
  ]);

  type Row = { status?: string; sourceType?: string; count: number };
  const statusRows = (statusCounts as unknown as { rows: Row[] }).rows;
  const sourceRows = (sourceCounts as unknown as { rows: Row[] }).rows;

  const totalItems = statusRows.reduce((sum, r) => sum + r.count, 0);

  return (
    <main className="max-w-4xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <AdminActions />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Items',   value: totalItems },
          { label: 'Active Trends', value: trendsCount[0]?.count ?? 0 },
          { label: 'Users',         value: usersCount[0]?.count ?? 0 },
          { label: 'Sources',       value: sourceRows.length },
        ].map(({ label, value }) => (
          <div key={label} className="border rounded-lg p-4">
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Pipeline Status</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-1">Status</th><th className="text-right py-1">Count</th></tr></thead>
            <tbody>
              {statusRows.map(r => (
                <tr key={r.status} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground font-mono">{r.status}</td>
                  <td className="py-1.5 text-right">{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">By Source Type</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-1">Source</th><th className="text-right py-1">Count</th></tr></thead>
            <tbody>
              {sourceRows.map(r => (
                <tr key={r.sourceType} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground">{r.sourceType}</td>
                  <td className="py-1.5 text-right">{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Items</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">Title</th>
              <th className="text-left py-1">Type</th>
              <th className="text-left py-1">Status</th>
              <th className="text-right py-1">Harvested</th>
            </tr>
          </thead>
          <tbody>
            {recentItems.map(item => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-1.5 text-muted-foreground max-w-xs truncate">
                  <a href={`/paper/${item.id}`} className="hover:underline">{item.title}</a>
                </td>
                <td className="py-1.5 text-muted-foreground">{item.sourceType}</td>
                <td className="py-1.5 font-mono text-xs">{item.processingStatus}</td>
                <td className="py-1.5 text-right text-muted-foreground">
                  {item.harvestedAt?.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
