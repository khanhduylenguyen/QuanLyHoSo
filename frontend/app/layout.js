import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter', display: 'swap' });

export const metadata = {
  title: 'Quản lý Hồ sơ',
  description: 'Hệ thống Quản lý, Phân công & Theo dõi Hạn Hồ sơ',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="flex min-h-screen flex-col bg-slate-100 font-sans text-slate-900 antialiased selection:bg-indigo-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
