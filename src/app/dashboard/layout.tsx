// src/app/dashboard/layout.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarProvider,
  // Removed unused imports like SidebarItem, SidebarSection, etc.
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar-alt"; // Using alternative sidebar for structure
import { LayoutDashboard, History, Send, Settings, LogOut, User, Home, Gift, ShieldCheck } from 'lucide-react'; // Added Gift and ShieldCheck icons
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

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
        console.log("DashboardLayout: User not logged in after loading, redirecting to login.");
        router.push('/login?message=Please login to access the dashboard');
      }
    }, [user, loading, router]);

    // Display loading state or null while checking auth/redirecting
    if (loading) {
        console.log("DashboardLayout: Auth/profile loading...");
        return <DashboardLayoutSkeleton />; // Show skeleton while loading
    }

     // If loading is complete but user is null (redirect might be happening)
     if (!user) {
         console.log("DashboardLayout: User is null after loading, potentially redirecting.");
         // You might want to render a minimal loading indicator or null here
         // while the redirect initiated in useEffect takes effect.
         return <DashboardLayoutSkeleton />; // Or return null
     }

      // If loading complete and user exists, render the layout
     console.log("DashboardLayout: User logged in, rendering layout. User profile:", userProfile);


  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

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
                        isActive={isActive('/dashboard') && pathname === '/dashboard'} // Exact match for overview
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
                              isActive={isActive('/admin')} // Highlight if in any admin section
                              tooltip="Admin Panel"
                            >
                              <Link href="/admin">
                                <ShieldCheck /> {/* Use ShieldCheck icon for admin */}
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


function DashboardLayoutSkeleton() {
  return (
      <div className="flex min-h-[calc(100vh-theme(spacing.14))]">
           {/* Sidebar Skeleton */}
           <aside className="hidden md:flex h-full flex-col bg-sidebar text-sidebar-foreground border-r w-[16rem]"> {/* Adjust width as needed */}
                <SidebarHeader className="p-2">
                   {/* Optional Skeleton Header */}
                </SidebarHeader>
                <SidebarContent className="p-2">
                    <SidebarMenu>
                       {[...Array(5)].map((_, i) => (
                          <SidebarMenuItem key={i}>
                             <div className="flex items-center gap-3 rounded-md px-3 py-2">
                                <Skeleton className="h-5 w-5 rounded" />
                                <Skeleton className="h-4 w-24 rounded" />
                             </div>
                          </SidebarMenuItem>
                       ))}
                     </SidebarMenu>
                </SidebarContent>
                 <SidebarFooter className="p-2">
                    <SidebarMenu>
                        {[...Array(2)].map((_, i) => (
                           <SidebarMenuItem key={i}>
                              <div className="flex items-center gap-3 rounded-md px-3 py-2">
                                 <Skeleton className="h-5 w-5 rounded" />
                                 <Skeleton className="h-4 w-24 rounded" />
                              </div>
                           </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                 </SidebarFooter>
           </aside>
           {/* Main Content Skeleton */}
           <main className="flex-1 p-6 overflow-auto bg-muted/20">
                {/* You can add a more specific skeleton for the main content area if needed */}
                <Skeleton className="h-32 w-full rounded-lg" />
                <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                   <Skeleton className="h-24 w-full rounded-lg" />
                   <Skeleton className="h-24 w-full rounded-lg" />
                   <Skeleton className="h-24 w-full rounded-lg" />
                </div>
           </main>
       </div>
  );
}
