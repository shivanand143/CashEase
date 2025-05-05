
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
  ClipboardList,
  Building,
  BadgePercent,
  TicketPercent,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import AdminGuard from '@/components/guards/admin-guard'; // Correct import path
import { useAuth } from '@/hooks/use-auth'; // Import useAuth for signout
import { cn } from '@/lib/utils';

// Define admin navigation items
const adminNavItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Manage Users', icon: Users },
  { href: '/admin/stores', label: 'Manage Stores', icon: Store },
  { href: '/admin/coupons', label: 'Manage Coupons', icon: BadgePercent }, // Changed icon
  { href: '/admin/categories', label: 'Categories', icon: Building }, // Added Categories
  { href: '/admin/banners', label: 'Banners', icon: TicketPercent }, // Added Banners
  { href: '/admin/transactions', label: 'Transactions', icon: ClipboardList },
  { href: '/admin/payouts', label: 'Payout Requests', icon: CreditCard },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 }, // Added Reports
  // Add more admin sections as needed
  // { href: '/admin/settings', label: 'Admin Settings', icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { userProfile, signOut } = useAuth(); // Get signOut function and profile

  const isActive = (href: string) => {
    // Handle exact match for overview, prefix match for others
    return href === '/admin' ? pathname === href : pathname.startsWith(href);
  };

  return (
     <AdminGuard> {/* Wrap the entire layout content with AdminGuard */}
        <SidebarProvider defaultOpen={true}>
          <div className="flex h-screen bg-background">
            <Sidebar side="left" variant="sidebar" collapsible="icon">
              <SidebarHeader className="justify-between p-4">
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
                         className="justify-start" // Align items to start
                      >
                        <Link href={item.href} className="flex items-center w-full">
                          <item.icon className="w-5 h-5 mr-3 shrink-0" /> {/* Added margin */}
                          <span className="sidebar-expanded:inline-block hidden truncate"> {/* Prevent text wrapping */}
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
                 <SidebarMenuButton variant="ghost" className="w-full justify-start" onClick={signOut} tooltip="Logout"> {/* Align logout */}
                    <LogOut className="w-5 h-5 mr-3 shrink-0" /> {/* Added margin */}
                    <span className="sidebar-expanded:inline-block hidden">Logout</span>
                 </SidebarMenuButton>
                 <SidebarToggleButton className="mt-auto mx-auto hidden md:flex" /> {/* Centered toggle for desktop */}
              </SidebarFooter>
            </Sidebar>

            {/* Main Content Area */}
             <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header within Main Area */}
                <header className="flex h-16 items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6 sticky top-0 z-30">
                    <div className="flex items-center gap-4 w-full">
                        {/* Mobile Toggle Button */}
                        <SidebarToggleButton className="md:hidden" />
                        <h1 className="flex-1 text-lg font-semibold md:text-xl truncate">
                           {adminNavItems.find(item => isActive(item.href))?.label || 'Admin Panel'}
                        </h1>
                        {/* Optional: Add search or user menu here */}
                        <div className="flex items-center gap-4 ml-auto">
                            {/* Add user profile/actions if needed */}
                             {userProfile && (
                                <span className="text-sm text-muted-foreground hidden md:inline">
                                    Welcome, {userProfile.displayName || 'Admin'}!
                                </span>
                             )}
                        </div>
                    </div>
                </header>
                {/* Content Scroll Area */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-muted/40">
                    {children}
                </main>
            </div>
          </div>
        </SidebarProvider>
     </AdminGuard>
  );
}
