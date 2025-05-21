// src/app/dashboard/layout.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  History,
  Send,
  Gift,
  Settings,
  ArrowLeft,
  Home,
  User,
  MousePointerClick,
  ReceiptText 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import ProtectedRoute from '@/components/guards/protected-route';

const dashboardNavItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/history', label: 'Cashback History', icon: History },
  { href: '/dashboard/clicks', label: 'Click History', icon: MousePointerClick },
  { href: '/dashboard/payout', label: 'Request Payout', icon: Send },
  { href: '/dashboard/payout-history', label: 'Payout History', icon: ReceiptText },
  { href: '/dashboard/referrals', label: 'Refer & Earn', icon: Gift },
  { href: '/dashboard/settings', label: 'Account Settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
  };

  return (
    <ProtectedRoute> 
      <div className="flex flex-col md:flex-row gap-6 md:gap-8"> {/* Adjusted gap for responsiveness */}
        <aside className="w-full md:w-60 lg:w-64 shrink-0"> {/* Slightly reduced width for md, adjust as needed */}
          <nav className="flex flex-col space-y-1 border rounded-lg p-2 bg-card shadow-sm sticky top-20"> {/* Sticky sidebar */}
             <Button variant="ghost" className="justify-start text-muted-foreground mb-2" asChild>
               <Link href="/">
                 <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
               </Link>
             </Button>
             <Separator className="mb-2" />

            {dashboardNavItems.map((item) => (
              <Button
                key={item.href}
                variant={isActive(item.href) ? 'secondary' : 'ghost'}
                className="justify-start"
                asChild
              >
                <Link href={item.href} className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0"> {/* Added min-w-0 to prevent flex item from overflowing */}
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
