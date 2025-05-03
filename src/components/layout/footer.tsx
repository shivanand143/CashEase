// src/components/layout/footer.tsx
import Link from 'next/link';
import { IndianRupee } from 'lucide-react'; // Assuming you use lucide-react
import { Facebook, Instagram, Twitter } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-muted text-muted-foreground border-t">
      <div className="container py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Branding Column */}
          <div className="col-span-1 md:col-span-1">
             <Link href="/" className="flex items-center space-x-2 mb-4">
               <IndianRupee className="h-7 w-7 text-primary" />
               <span className="font-bold text-xl text-foreground">CashEase</span>
             </Link>
             <p className="text-sm">
               Shop smarter, earn easier. Your #1 destination for cashback and coupons in India.
             </p>
             <p className="text-sm mt-4">
               &copy; {new Date().getFullYear()} CashEase. All rights reserved.
             </p>
          </div>

          {/* Quick Links Column */}
          <div className="col-span-1">
            <h4 className="font-semibold text-foreground mb-3">Quick Links</h4>
            <nav className="flex flex-col space-y-2">
              <Link href="/stores" className="text-sm hover:text-primary transition-colors">
                All Stores
              </Link>
              <Link href="/coupons" className="text-sm hover:text-primary transition-colors">
                Top Coupons
              </Link>
              <Link href="/how-it-works" className="text-sm hover:text-primary transition-colors">
                How It Works
              </Link>
               <Link href="/amazon-deals" className="text-sm hover:text-primary transition-colors">
                 Amazon Deals
               </Link>
            </nav>
          </div>

          {/* Company Column */}
          <div className="col-span-1">
            <h4 className="font-semibold text-foreground mb-3">Company</h4>
            <nav className="flex flex-col space-y-2">
              <Link href="/about" className="text-sm hover:text-primary transition-colors">
                About Us
              </Link>
              <Link href="/contact" className="text-sm hover:text-primary transition-colors">
                Contact Us
              </Link>
              <Link href="/faq" className="text-sm hover:text-primary transition-colors">
                 FAQ
              </Link>
            </nav>
          </div>

           {/* Legal Column */}
           <div className="col-span-1">
             <h4 className="font-semibold text-foreground mb-3">Legal</h4>
             <nav className="flex flex-col space-y-2">
               <Link href="/privacy" className="text-sm hover:text-primary transition-colors">
                 Privacy Policy
               </Link>
               <Link href="/terms" className="text-sm hover:text-primary transition-colors">
                 Terms of Service
               </Link>
                <Link href="/disclaimer" className="text-sm hover:text-primary transition-colors">
                  Disclaimer
                </Link>
             </nav>
           </div>
        </div>

        {/* Social Media Links (Optional) */}
        <div className="mt-8 pt-8 border-t border-border/50 flex justify-center space-x-4">
           <Link href="#" aria-label="Facebook" className="text-muted-foreground hover:text-primary"><Facebook /></Link>
           <Link href="#" aria-label="Twitter" className="text-muted-foreground hover:text-primary"><Twitter /></Link>
           <Link href="#" aria-label="Instagram" className="text-muted-foreground hover:text-primary"><Instagram /></Link>
        </div>
      </div>
    </footer>
  );
}

    