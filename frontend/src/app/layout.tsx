import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Kenzo Infosystems',
    template: '%s | Kenzo Infosystems',
  },
  description: 'Kenzo Infosystems Business Management Software.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Every page depends on the signed-in user and on live settings.
 * Rendering them at build time baked in the state of the build machine, so
 * each route is rendered per request.
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-base text-ink">
        {children}
      </body>
    </html>
  );
}
