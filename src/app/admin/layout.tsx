// src/app/admin/layout.tsx
"use client";

// Reusing the DashboardLayout structure for consistency
// You could create a completely separate layout if admin needs differ significantly

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarProvider,
  SidebarMenuItem,
  SidebarMenu,
  SidebarMenuButton,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar-alt"; // Using the same alternative sidebar
import { LayoutDashboard, Users, Store, Tag, Send, ShieldCheck, Home, LogOut, ListOrdered } from 'lucide-react'; // Added ListOrdered
import { useAuth } from '@/hooks/use-auth';
import AdminGuard from '@/components/guards/admin-guard'; // Import the guard


function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`); // Match base path and subpaths

  return (
     <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-[calc(100vh-theme(spacing.14))]">
            <Sidebar side="left" variant='sidebar' collapsible='icon'>
               <SidebarHeader className="p-2 justify-center">
                 <Link href="/admin" className='flex items-center gap-2 font-semibold'>
                    <ShieldCheck className="w-6 h-6 text-primary"/>
                    <span className='text-lg group-data-[collapsible=true]:hidden'>Admin Panel</span>
                 </Link>
               </SidebarHeader>
              <SidebarContent className="p-2">
                 <SidebarMenu>
                     <SidebarMenuItem>
                       <SidebarMenuButton
                         asChild
                         isActive={isActive('/admin') && pathname === '/admin'} // Exact match for overview
                         tooltip="Overview"
                       >
                         <Link href="/admin">
                            <LayoutDashboard />
                            <span>Overview</span>
                         </Link>
                       </SidebarMenuButton>
                     </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive('/admin/users')}
                          tooltip="Users"
                        >
                          <Link href="/admin/users">
                             <Users />
                             <span>Users</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive('/admin/stores')}
                          tooltip="Stores"
                        >
                          <Link href="/admin/stores">
                             <Store />
                             <span>Stores</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                       <SidebarMenuItem>
                         <SidebarMenuButton
                           asChild
                           isActive={isActive('/admin/coupons')}
                           tooltip="Coupons"
                         >
                           <Link href="/admin/coupons">
                              <Tag />
                              <span>Coupons</span>
                           </Link>
                         </SidebarMenuButton>
                       </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive('/admin/transactions')}
                            tooltip="Transactions"
                          >
                            <Link href="/admin/transactions">
                               <ListOrdered />
                               <span>Transactions</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      <SidebarMenuItem>
                         <SidebarMenuButton
                           asChild
                           isActive={isActive('/admin/payouts')}
                           tooltip="Payouts"
                         >
                           <Link href="/admin/payouts">
                              <Send />
                              <span>Payouts</span>
                           </Link>
                         </SidebarMenuButton>
                       </SidebarMenuItem>
                      {/* Add more admin sections here */}

                 </SidebarMenu>
              </SidebarContent>
              <SidebarFooter className="p-2">
                  <SidebarMenu>
                     <SidebarMenuItem>
                       <SidebarMenuButton
                         asChild
                         tooltip="Back to Home"
                        >
                         <Link href="/">
                            <Home />
                            <span>Back to Home</span>
                         </Link>
                       </SidebarMenuButton>
                     </SidebarMenuItem>
                     <SidebarMenuItem>
                        <SidebarMenuButton onClick={signOut} tooltip="Log Out">
                            <LogOut />
                            <span>Log Out</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                   </SidebarMenu>
              </SidebarFooter>
            </Sidebar>

           <main className="flex-1 p-6 overflow-auto bg-muted/20">
             {children}
           </main>
       </div>
     </SidebarProvider>
  );
}


// Wrap the entire layout content with the AdminGuard
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <AdminGuard>
            <AdminLayoutContent>{children}</AdminLayoutContent>
        </AdminGuard>
    );
}
