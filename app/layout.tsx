import type { Metadata, Viewport } from 'next';
import { AuthProvider } from './components/AuthProvider';
import { NotificationProvider } from './components/NotificationProvider';
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
        {/* Inter font — professional medical typography */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Tailwind clinical theme config */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                theme: {
                  extend: {
                    colors: {
                      clinical: {
                        navy: '#1a2740',
                        cyan: '#0072B2',
                        emerald: '#059669',
                        coral: '#ef4444',
                        amber: '#f59e0b',
                        light: '#f8fafc',
                        dark: '#1e293b',
                      },
                    },
                    fontFamily: {
                      sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
                    },
                    borderRadius: {
                      DEFAULT: '0.5rem',
                    },
                    boxShadow: {
                      'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
                    },
                  },
                },
              };
            `,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a2740" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RosterDoc" />
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <AuthProvider>
          <PWAProvider>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </PWAProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
