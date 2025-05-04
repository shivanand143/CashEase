import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth'; // Updated import if necessary, though alias might handle it
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Toaster } from "@/components/ui/toaster" // Import Toaster

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});


export const metadata: Metadata = {
  title: 'CashEase - Cashback & Coupons',
  description: 'Get cashback and find the best coupons for your online shopping with CashEase.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} antialiased`}>
        <AuthProvider>
          {/* Apply max-width and centering to the entire layout structure */}
          <div className="flex flex-col min-h-screen max-w-screen-lg mx-auto"> {/* Added max-width and mx-auto */}
            <Header />
            {/* Remove container class from main, let the outer div handle width */}
            <main className="flex-grow w-full">{children}</main>
            <Footer />
          </div>
          <Toaster /> {/* Add Toaster here */}
        </AuthProvider>
      </body>
    </html>
  );
}
