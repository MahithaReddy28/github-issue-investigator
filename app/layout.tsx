import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Issue Investigator | GitHub evidence, clearly connected',
  description: 'Investigate public GitHub issues with source-linked evidence, related discussions, and actionable debugging steps.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
