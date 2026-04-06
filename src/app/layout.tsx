import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Pulse',
  description: 'Stay current in AI/ML research',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
