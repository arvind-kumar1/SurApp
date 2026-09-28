import { Poppins } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins' });

export const metadata = {
  title: 'Sur',
  description: 'Sur — stream songs from the artists you love, in your languages, with lyrics and smart recommendations.',
  icons: {
    icon: [
      { url: '/icon.png', sizes: 'any' },
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/icon.png',
  }
};

export const viewport = {
  themeColor: '#07060d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
