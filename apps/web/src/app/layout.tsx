import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Kenzo Infosystems ERP',
    template: '%s | Kenzo Infosystems ERP',
  },
  description: 'Enterprise resource planning and business management system.',
};

export const viewport: Viewport = {
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
      <body className="min-h-screen bg-canvas font-sans text-base text-ink">
        {children}
      </body>
    </html>
  );
}
