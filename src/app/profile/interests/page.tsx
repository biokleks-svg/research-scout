'use client';

import { useState } from 'react';
import { trpc } from '@/app/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Plus, Loader2 } from 'lucide-react';

export default function InterestsPage() {
  const [inputValue, setInputValue] = useState('');

  const { data, refetch } = trpc.user.getInterests.useQuery();
  const addMutation    = trpc.user.addFreeTextInterest.useMutation({ onSuccess: () => { void refetch(); } });
  const removeMutation = trpc.user.removeFreeTextInterest.useMutation({ onSuccess: () => { void refetch(); } });

  function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    addMutation.mutate({ text: trimmed });
    setInputValue('');
  }

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Your Interests</h1>
        <p className="text-muted-foreground text-sm">
          Add topics, techniques, or researchers you care about. The feed uses these to personalise your experience.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add an interest</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. diffusion models, Andrej Karpathy, RLHF…"
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button onClick={handleAdd} disabled={addMutation.isPending || !inputValue.trim()}>
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your topics</CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.freeText.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interests yet. Add some above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.freeText.map((interest) => (
                <Badge key={interest} variant="secondary" className="flex items-center gap-1 pr-1">
                  {interest}
                  <button
                    onClick={() => removeMutation.mutate({ text: interest })}
                    className="ml-1 hover:text-red-600 transition-colors"
                    aria-label={`Remove ${interest}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
