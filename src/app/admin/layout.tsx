
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
} from '@/components/ui/sidebar-alt';
import {
  LayoutDashboard,
  Users,
  Store,
  Settings,
  LogOut,
  IndianRupee,
  CreditCard,
  ClipboardList,
  Building2,
  BadgePercent,
  TicketPercent, // Keep for banners
  BarChart3,
  Package,
  MousePointerClick // For Clicks
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import AdminGuard from '@/components/guards/admin-guard';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

// Define admin navigation items
const adminNavItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Manage Users', icon: Users },
  { href: '/admin/stores', label: 'Manage Stores', icon: Store },
  { href: '/admin/products', label: 'Manage Products', icon: Package },
  { href: '/admin/coupons', label: 'Manage Coupons', icon: BadgePercent },
  { href: '/admin/categories', label: 'Manage Categories', icon: Building2 },
  { href: '/admin/banners', label: 'Manage Banners', icon: TicketPercent },
  { href: '/admin/transactions', label: 'Transactions', icon: ClipboardList },
  { href: '/admin/clicks', label: 'Click Logs', icon: MousePointerClick }, // New Click Logs
  { href: '/admin/payouts', label: 'Payout Requests', icon: CreditCard },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  // { href: '/admin/settings', label: 'Admin Settings', icon: Settings }, // If you add global admin settings
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { userProfile, signOut } = useAuth();

  const isActive = (href: string) => {
    return href === '/admin' ? pathname === href : pathname.startsWith(href);
  };

   const activeLabel = adminNavItems.find(item => isActive(item.href))?.label || 'Admin Panel';

  return (
     <AdminGuard>
        <SidebarProvider defaultOpen={true}>
          <div className="flex h-screen bg-background">
             <Sidebar
                side="left"
                variant="sidebar"
                collapsible="icon"
                className="hidden md:flex"
             >
               <SidebarHeader className="justify-between p-4">
                 <Link href="/admin" className="flex items-center gap-2 flex-grow">
                   <IndianRupee className="w-6 h-6 text-primary" />
                   <span className="font-semibold text-lg sidebar-expanded:inline-block hidden">
                     CashEase Admin
                   </span>
                 </Link>
               </SidebarHeader>

               <SidebarContent className="p-2">
                 <SidebarMenu>
                   {adminNavItems.map((item) => (
                     <SidebarMenuItem key={item.href}>
                       <SidebarMenuButton
                         asChild
                         isActive={isActive(item.href)}
                         tooltip={item.label}
                         className="justify-start"
                       >
                         <Link href={item.href} className="flex items-center w-full">
                           <item.icon className="w-5 h-5 mr-3 shrink-0" />
                           <span className="sidebar-expanded:inline-block hidden truncate">
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
                  <SidebarMenuButton variant="ghost" className="w-full justify-start" onClick={signOut} tooltip="Logout">
                     <LogOut className="w-5 h-5 mr-3 shrink-0" />
                     <span className="sidebar-expanded:inline-block hidden">Logout</span>
                  </SidebarMenuButton>
                  <SidebarToggleButton className="mt-auto mx-auto" />
               </SidebarFooter>
             </Sidebar>

             <div className="flex flex-1 flex-col overflow-hidden">
                <header className="flex h-16 items-center border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6 sticky top-0 z-30">
                    <div className="flex items-center gap-4 w-full">
                        <SidebarToggleButton className="md:hidden" />
                        <h1 className="flex-1 text-lg font-semibold md:text-xl truncate">
                            {activeLabel}
                        </h1>
                        <div className="flex items-center gap-4 ml-auto">
                             {userProfile && (
                                <span className="text-sm text-muted-foreground hidden md:inline">
                                    Welcome, {userProfile.displayName || 'Admin'}!
                                </span>
                             )}
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-muted/40">
                    {children}
                </main>
            </div>
          </div>
        </SidebarProvider>
     </AdminGuard>
  );
}
