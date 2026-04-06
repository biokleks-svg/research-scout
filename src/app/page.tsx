import { FeedList } from '@/components/feed/FeedList';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">
            AI Pulse <span className="text-muted-foreground font-normal text-sm">/ feed</span>
          </h1>
          <span className="text-xs text-muted-foreground">Phase 1</span>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <FeedList />
      </div>
    </main>
  );
}
