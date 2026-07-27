import type { Metadata } from 'next';
import { AuthProvider } from './components/AuthProvider';

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
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
