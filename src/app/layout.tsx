
import type { Metadata } from 'next';
import { Inter as FontSans } from 'next/font/google'; // Using Inter font
import './globals.css';
import { cn } from "@/lib/utils";
import { AuthProvider } from '@/hooks/use-auth';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Toaster } from "@/components/ui/toaster";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: 'MagicSaver - Cashback & Coupons Rebuilt',
  description: 'Get cashback and find the best coupons for your online shopping.',
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
            {/* Main content area */}
            <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
              {children}
            </main>
            <Footer />
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
