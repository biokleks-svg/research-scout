'use client';

import { useState } from 'react';
import { trpc } from '@/app/providers';

export function AdminActions() {
  const [message, setMessage] = useState<string | null>(null);
  const runForecast = trpc.forecast.run.useMutation({
    onSuccess: () => setMessage('Forecast queued — results will appear on /forecast shortly.'),
    onError:   (e) => setMessage(`Error: ${e.message}`),
  });

  return (
    <div className="border rounded-lg p-5 space-y-3">
      <h2 className="text-lg font-semibold">Actions</h2>
      <div className="flex items-center gap-4">
        <button
          onClick={() => { setMessage(null); runForecast.mutate(); }}
          disabled={runForecast.isPending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {runForecast.isPending ? 'Queuing…' : 'Run 6-Month Forecast'}
        </button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
