// src/components/layout/footer.tsx
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-muted text-muted-foreground">
      <div className="container py-8 flex flex-col md:flex-row justify-between items-center">
        <p className="text-sm">
          &copy; {new Date().getFullYear()} CashEase. All rights reserved.
        </p>
        <nav className="flex space-x-4 mt-4 md:mt-0">
          <Link href="/about" className="text-sm hover:text-primary">
            About Us
          </Link>
          <Link href="/contact" className="text-sm hover:text-primary">
            Contact
          </Link>
          <Link href="/privacy" className="text-sm hover:text-primary">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-sm hover:text-primary">
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
