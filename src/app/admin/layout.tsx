"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarToggleButton,
} from '@/components/ui/sidebar-alt'; // Adjust import path if necessary
import {
  LayoutDashboard,
  Users,
  Store,
  Tag,
  Settings,
  LogOut,
  IndianRupee,
  CreditCard,
  ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import AdminGuard from '@/components/guards/admin-guard'; // Import AdminGuard
import { useAuth } from '@/hooks/use-auth'; // Import useAuth for signout

// Define admin navigation items
const adminNavItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Manage Users', icon: Users },
  { href: '/admin/stores', label: 'Manage Stores', icon: Store },
  { href: '/admin/coupons', label: 'Manage Coupons', icon: Tag },
  { href: '/admin/transactions', label: 'Transactions', icon: ClipboardList },
  { href: '/admin/payouts', label: 'Payout Requests', icon: CreditCard },
  // Add more admin sections as needed
  // { href: '/admin/settings', label: 'Admin Settings', icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth(); // Get signOut function

  const isActive = (href: string) => {
    // Handle exact match for overview, prefix match for others
    return href === '/admin' ? pathname === href : pathname.startsWith(href);
  };

  return (
     <AdminGuard> {/* Wrap the entire layout content with AdminGuard */}
        <SidebarProvider defaultOpen={true}>
          <div className="flex h-screen bg-background">
            <Sidebar side="left" variant="sidebar" collapsible="icon">
              <SidebarHeader className="justify-between">
                <Link href="/admin" className="flex items-center gap-2 flex-grow">
                  <IndianRupee className="w-6 h-6 text-primary" />
                  <span className="font-semibold text-lg sidebar-expanded:inline-block hidden">
                    CashEase Admin
                  </span>
                </Link>
                 {/* Optional: Keep toggle button inside header */}
                {/* <SidebarToggleButton className="ml-auto" /> */}
              </SidebarHeader>

              <SidebarContent className="p-2">
                <SidebarMenu>
                  {adminNavItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.href)}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <item.icon className="w-5 h-5" />
                          <span className="sidebar-expanded:inline-block hidden">
                            {item.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarContent>

              <SidebarFooter className="p-2 flex flex-col gap-2">
                 <Separator className="my-1"/>
                 <SidebarMenuButton variant="ghost" className="w-full" onClick={signOut} tooltip="Logout">
                    <LogOut className="w-5 h-5" />
                    <span className="sidebar-expanded:inline-block hidden">Logout</span>
                 </SidebarMenuButton>
                 <SidebarToggleButton className="mt-auto mx-auto hidden md:flex" /> {/* Centered toggle for desktop */}
              </SidebarFooter>
            </Sidebar>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden">
              {/* Optional Header within Main Area */}
               <header className="flex items-center justify-between h-16 border-b px-4 md:px-6 sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40">
                   {/* Mobile Toggle Button */}
                   <SidebarToggleButton className="md:hidden"/>
                   {/* Add other header elements if needed, e.g., search, notifications */}
                   <div className="flex-1"></div> {/* Spacer */}
                   {/* User menu or other actions */}
               </header>
               <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                  {children}
               </div>
            </main>
          </div>
        </SidebarProvider>
     </AdminGuard>
  );
}
