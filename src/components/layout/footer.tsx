
"use client";

import * as React from 'react';
import Link from 'next/link';
import { IndianRupee, Facebook, Instagram, Twitter } from 'lucide-react';
import BottomNavigation from './bottom-navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHasMounted } from '@/hooks/use-has-mounted'; // Import the new hook

export default function Footer() {
  const isMobile = useIsMobile();
  const hasMounted = useHasMounted();

  if (!hasMounted) {
    // Render nothing or a consistent placeholder on the server and initial client render
    // to prevent hydration mismatch. Returning null is often the safest.
    return null;
  }

  if (isMobile) {
    return <BottomNavigation />;
  }

  return (
    <footer className="bg-muted text-muted-foreground border-t mt-16">
      <div className="container mx-auto px-4 md:px-6 py-8 md:py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Branding */}
        <div className="space-y-4">
          <Link href="/" className="flex items-center space-x-2">
            <IndianRupee className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl text-foreground">MagicSaver</span>
          </Link>
          <p className="text-sm">
            Shop smarter, earn easier. Your #1 destination for cashback and coupons in India.
          </p>
          <p className="text-xs text-muted-foreground/80">
            &copy; {new Date().getFullYear()} MagicSaver. All rights reserved.
          </p>
        </div>

        {/* Discover Links */}
        <div>
          <h4 className="font-semibold text-foreground mb-3">Discover</h4>
          <nav className="flex flex-col space-y-2">
            <Link href="/stores" className="text-sm hover:text-primary transition-colors">All Stores</Link>
            <Link href="/coupons" className="text-sm hover:text-primary transition-colors">Top Coupons</Link>
            <Link href="/categories" className="text-sm hover:text-primary transition-colors">Categories</Link>
            <Link href="/how-it-works" className="text-sm hover:text-primary transition-colors">How It Works</Link>
          </nav>
        </div>

        {/* Company Links */}
        <div>
          <h4 className="font-semibold text-foreground mb-3">Company</h4>
          <nav className="flex flex-col space-y-2">
            <Link href="/about" className="text-sm hover:text-primary transition-colors">About Us</Link>
            <Link href="/blog" className="text-sm hover:text-primary transition-colors">Blog</Link>
            <Link href="/contact" className="text-sm hover:text-primary transition-colors">Contact Us</Link>
            <Link href="/faq" className="text-sm hover:text-primary transition-colors">FAQ</Link>
          </nav>
        </div>

        {/* Legal & Social */}
        <div className="space-y-6">
          <div>
             <h4 className="font-semibold text-foreground mb-3">Legal</h4>
             <nav className="flex flex-col space-y-2">
                <Link href="/privacy" className="text-sm hover:text-primary transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="text-sm hover:text-primary transition-colors">Terms of Service</Link>
             </nav>
          </div>
          <div>
             <h4 className="font-semibold text-foreground mb-3">Follow Us</h4>
             <div className="flex space-x-4">
               <Link href="#" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-muted-foreground hover:text-primary transition-colors"><Facebook className="w-5 h-5" /></Link>
               <Link href="#" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="text-muted-foreground hover:text-primary transition-colors"><Twitter className="w-5 h-5"/></Link>
               <Link href="#" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-muted-foreground hover:text-primary transition-colors"><Instagram className="w-5 h-5"/></Link>
             </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
