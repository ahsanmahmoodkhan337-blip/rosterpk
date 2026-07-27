import type { Metadata, Viewport } from 'next';
import { AuthProvider } from './components/AuthProvider';
import PWAProvider from './components/PWAProvider';

export const metadata: Metadata = {
  title: 'RosterDoc — Smart Hospital Scheduling',
  description: 'Hospital shift scheduling for Pakistani doctors',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'RosterDoc',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a2740',
  width: 'device-width',
  initialScale: 1,
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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a2740" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RosterDoc" />
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <AuthProvider>
          <PWAProvider>{children}</PWAProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
