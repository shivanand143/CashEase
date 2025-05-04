// src/components/layout/footer.tsx
import Link from 'next/link';
import { IndianRupee } from 'lucide-react';
import { Facebook, Instagram, Twitter } from "lucide-react";

export default function Footer() {
  return (
    // Removed container class, padding adjusted slightly
    <footer className="bg-muted text-muted-foreground border-t mt-16 px-4 md:px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* Branding Column */}
          <div className="col-span-1 space-y-4">
             <Link href="/" className="flex items-center space-x-2 ">
               <IndianRupee className="h-7 w-7 text-primary" />
               <span className="font-bold text-xl text-foreground">CashEase</span>
             </Link>
             <p className="text-sm">
               Shop smarter, earn easier. Your #1 destination for cashback and coupons in India.
             </p>
             <p className="text-sm">
               &copy; {new Date().getFullYear()} CashEase. All rights reserved.
             </p>
          </div>

          {/* Quick Links Column */}
          <div className="col-span-1">
            <h4 className="font-semibold text-foreground mb-3">Discover</h4>
            <nav className="flex flex-col space-y-2">
              <Link href="/stores" className="text-sm hover:text-primary transition-colors">
                All Stores
              </Link>
              <Link href="/coupons" className="text-sm hover:text-primary transition-colors">
                Top Coupons
              </Link>
              <Link href="/categories" className="text-sm hover:text-primary transition-colors">
                 All Categories
               </Link>
              <Link href="/how-it-works" className="text-sm hover:text-primary transition-colors">
                How It Works
              </Link>
               {/* <Link href="/amazon-deals" className="text-sm hover:text-primary transition-colors">
                 Amazon Deals
               </Link> */}
            </nav>
          </div>

          {/* Company Column */}
          <div className="col-span-1">
            <h4 className="font-semibold text-foreground mb-3">Company</h4>
            <nav className="flex flex-col space-y-2">
              <Link href="/about" className="text-sm hover:text-primary transition-colors">
                About Us
              </Link>
               <Link href="/blog" className="text-sm hover:text-primary transition-colors">
                 Blog
               </Link>
              <Link href="/contact" className="text-sm hover:text-primary transition-colors">
                Contact Us
              </Link>
              <Link href="/faq" className="text-sm hover:text-primary transition-colors">
                 FAQ
              </Link>
            </nav>
          </div>

           {/* Legal & Social Column */}
           <div className="col-span-1 space-y-4">
             <div>
                <h4 className="font-semibold text-foreground mb-3">Legal</h4>
                <nav className="flex flex-col space-y-2">
                  <Link href="/privacy" className="text-sm hover:text-primary transition-colors">
                    Privacy Policy
                  </Link>
                  <Link href="/terms" className="text-sm hover:text-primary transition-colors">
                    Terms of Service
                  </Link>
                   {/* <Link href="/disclaimer" className="text-sm hover:text-primary transition-colors">
                     Disclaimer
                   </Link> */}
                </nav>
             </div>
             {/* Social Media Links */}
              <div className="mt-4 pt-4 border-t border-border/20 md:border-none md:pt-0">
                 <h4 className="font-semibold text-foreground mb-3 hidden md:block">Follow Us</h4>
                 <div className="flex space-x-4">
                   <Link href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-muted-foreground hover:text-primary transition-colors"><Facebook className="w-5 h-5" /></Link>
                   <Link href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="text-muted-foreground hover:text-primary transition-colors"><Twitter className="w-5 h-5"/></Link>
                   <Link href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-muted-foreground hover:text-primary transition-colors"><Instagram className="w-5 h-5"/></Link>
                 </div>
              </div>
           </div>
        </div>
    </footer>
  );
}
