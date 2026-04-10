'use client';

import { useState } from 'react';
import type { JustificationDossier } from '@/types/critic';

interface Props {
  justification: JustificationDossier;
}

export function JustificationPanel({ justification }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors text-left"
      >
        <span>Why is this here?</span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {justification.positionExplanation}
          </p>

          {justification.comparisonToTopPeers.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 text-muted-foreground">
                Top Peers in Cohort
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 text-muted-foreground font-medium">Rank</th>
                    <th className="text-left py-1 text-muted-foreground font-medium">Paper</th>
                    <th className="text-right py-1 text-muted-foreground font-medium">Composite</th>
                  </tr>
                </thead>
                <tbody>
                  {justification.comparisonToTopPeers.map(peer => {
                    const scoreValues = Object.values(peer.scores);
                    const composite = scoreValues.length > 0
                      ? (scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length).toFixed(1)
                      : '—';
                    return (
                    <tr key={peer.rank} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 text-muted-foreground">#{peer.rank}</td>
                      <td className="py-1.5 text-muted-foreground">{peer.title}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{composite}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {justification.agentAuditTrail.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 text-muted-foreground">
                Agent Audit Trail
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                {justification.agentAuditTrail.map((entry, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{entry.agent}</span>
                    <span className="text-muted-foreground ml-2">{entry.action}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
