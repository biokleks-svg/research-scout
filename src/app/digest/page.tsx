import { redirect } from 'next/navigation';
import { lucia } from '@/lib/auth';
import { cookies } from 'next/headers';
import { composeDigest } from '@/agents/intelligence/digest-composer';

export const revalidate = 3600; // 1 hour

export default async function DigestPage() {
  const cookieStore = await cookies();
  const sessionId   = lucia.readSessionCookie(cookieStore.toString());
  if (!sessionId) redirect('/login');

  const { user } = await lucia.validateSession(sessionId);
  if (!user) redirect('/login');

  const digestMarkdown = await composeDigest(user.id, 10);

  return (
    <main className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Your Daily Digest</h1>
      <div className="prose prose-sm max-w-none">
        {digestMarkdown.split('\n').map((line, i) => {
          if (line.startsWith('## '))   return <h2 key={i} className="text-lg font-semibold mt-6 mb-2">{line.slice(3)}</h2>;
          if (line.startsWith('# '))    return <h1 key={i} className="text-2xl font-bold mb-1">{line.slice(2)}</h1>;
          if (line.startsWith('*') && line.endsWith('*')) return <p key={i} className="text-sm text-muted-foreground mb-4">{line.slice(1, -1)}</p>;
          if (line.startsWith('• **'))  return <p key={i} className="font-medium text-sm mt-3">{line.slice(2)}</p>;
          if (line.startsWith('  > '))  return <p key={i} className="text-sm text-muted-foreground italic ml-4">{line.slice(4)}</p>;
          if (line.startsWith('  '))    return <a key={i} href={line.trim()} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline ml-4 block">{line.trim()}</a>;
          return line ? <p key={i} className="text-sm">{line}</p> : <br key={i} />;
        })}
      </div>
    </main>
  );
}
