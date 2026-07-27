import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RosterDoc — Smart Hospital Scheduling',
  description: 'Hospital shift scheduling for Pakistani doctors',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
