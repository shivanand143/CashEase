// src/app/dashboard/layout.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarProvider,
  SidebarItem,
  SidebarSection,
  SidebarSubmenu,
  SidebarSubmenuItem,
  SidebarTitle,
  SidebarSubmenuButton,
  SidebarToggleButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar-alt"; // Using alternative sidebar for structure
import { LayoutDashboard, History, Send, Settings, LogOut, User, Home, Gift } from 'lucide-react'; // Added Gift icon
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, userProfile, loading, signOut } = useAuth();
   const router = useRouter();

   React.useEffect(() => {
      // Redirect to login if not authenticated after loading
      if (!loading && !user) {
        router.push('/login?message=Please login to access the dashboard');
      }
    }, [user, loading, router]);

    // Display loading state or null while checking auth/redirecting
    if (loading || !user) {
        return (
          <div className="flex justify-center items-center h-screen">
            <p>Loading dashboard...</p> {/* Or a spinner component */}
          </div>
        );
    }


  const isActive = (path: string) => pathname === path;

  return (
    <SidebarProvider defaultOpen={true}>
       <div className="flex min-h-[calc(100vh-theme(spacing.14))]"> {/* Adjust height based on header */}
           <Sidebar side="left" variant='sidebar' collapsible='icon'>
             <SidebarHeader className="p-2">
                {/* Optional Header Content like Logo or User */}
             </SidebarHeader>
             <SidebarContent className="p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/dashboard')}
                        tooltip="Dashboard"
                      >
                        <Link href="/dashboard">
                           <LayoutDashboard />
                           <span>Overview</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/dashboard/history')}
                        tooltip="Cashback History"
                      >
                        <Link href="/dashboard/history">
                           <History />
                           <span>Cashback History</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/dashboard/payout')}
                        tooltip="Payout"
                      >
                        <Link href="/dashboard/payout">
                           <Send />
                           <span>Payout</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                     <SidebarMenuItem>
                       <SidebarMenuButton
                         asChild
                         isActive={isActive('/dashboard/referrals')}
                         tooltip="Referrals"
                       >
                         <Link href="/dashboard/referrals">
                            <Gift /> {/* Added Referrals Link */}
                            <span>Referrals</span>
                         </Link>
                       </SidebarMenuButton>
                     </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive('/dashboard/settings')}
                        tooltip="Settings"
                      >
                        <Link href="/dashboard/settings">
                           <Settings />
                           <span>Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                     {/* Admin Link - Conditional */}
                     {userProfile?.role === 'admin' && (
                        <SidebarMenuItem>
                           <SidebarMenuButton
                             asChild
                             isActive={pathname.startsWith('/admin')} // Highlight if in any admin section
                             tooltip="Admin Panel"
                           >
                             <Link href="/admin">
                               <User />
                               <span>Admin Panel</span>
                             </Link>
                           </SidebarMenuButton>
                        </SidebarMenuItem>
                     )}

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
