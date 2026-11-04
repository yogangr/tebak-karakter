import './globals.css';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--f-display', weight: ['600', '800'] });
const body = Figtree({ subsets: ['latin'], variable: '--f-body' });

export const metadata = { title: 'Siapa Aku? · Duel Tebak Karakter' };
export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
