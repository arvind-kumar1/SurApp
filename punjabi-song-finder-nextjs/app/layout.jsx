import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins' });

export const metadata = {
  title: 'Sur',
  description: 'Sur — stream songs from the artists you love, in your languages, with lyrics and smart recommendations.'
};

export const viewport = { themeColor: '#07060d' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
