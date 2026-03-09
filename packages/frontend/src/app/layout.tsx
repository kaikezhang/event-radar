import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Event Radar',
  description: 'Real-time event-driven trading intelligence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
