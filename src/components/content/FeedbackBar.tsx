'use client';
import { useState } from 'react';
import { trpc } from '@/app/providers';

interface Props {
  contentId: string;
}

export function FeedbackBar({ contentId }: Props) {
  const [given, setGiven] = useState<string | null>(null);
  const { mutate: addFeedback } = trpc.feedback.add.useMutation();

  function handleFeedback(type: 'like' | 'dislike' | 'save' | 'dismiss') {
    if (given === type) return;
    addFeedback({ contentId, feedbackType: type });
    setGiven(type);
  }

  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs text-muted-foreground">Was this useful?</span>
      {([
        { type: 'like',    label: '👍' },
        { type: 'dislike', label: '👎' },
        { type: 'save',    label: '🔖 Save' },
        { type: 'dismiss', label: '✕' },
      ] as const).map(({ type, label }) => (
        <button
          key={type}
          onClick={() => handleFeedback(type)}
          className={`text-sm px-2 py-1 rounded transition-colors ${
            given === type
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
