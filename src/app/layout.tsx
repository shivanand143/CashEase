
import type { Metadata } from 'next';
import { Inter as FontSans } from 'next/font/google';
import './globals.css';
import { cn } from "@/lib/utils";
import { AuthProvider } from '@/hooks/use-auth';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Toaster } from "@/components/ui/toaster";
import * as React from 'react'; // Ensure React is imported for Suspense

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: 'MagicSaver - Cashback & Coupons',
  description: 'Get cashback and find the best coupons for your online shopping with MagicSaver.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable
        )}
      >
        <AuthProvider>
          <div className="relative flex min-h-screen flex-col bg-background">
            <Header />
            <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
              <React.Suspense fallback={<div className="flex justify-center items-center min-h-[calc(100vh-20rem)]"><p>Loading page...</p></div>}>
                {children}
              </React.Suspense>
            </main>
            <Footer />
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
