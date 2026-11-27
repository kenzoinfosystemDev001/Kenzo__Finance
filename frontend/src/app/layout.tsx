import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { THEME_COOKIE } from '@/lib/theme';

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Light or dark is set on <html> while rendering, so the page never flashes
  // the wrong theme. "system" leaves the attribute off and the device setting applies.
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = stored === 'light' || stored === 'dark' ? stored : undefined;

  return (
    <html lang="en" data-theme={theme}>
      <body className="min-h-screen bg-canvas font-sans text-base text-ink">
        {children}
      </body>
    </html>
  );
}
