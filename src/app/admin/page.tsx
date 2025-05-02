// src/app/admin/page.tsx
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Users, Store, Tag, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import AdminGuard from '@/components/guards/admin-guard'; // Import the guard

function AdminDashboardContent() {
   // Fetch admin specific data here if needed

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         {/* Placeholder cards for admin sections */}
         <Link href="/admin/users">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Manage Users</CardTitle>
                 <Users className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">...</div> {/* TODO: Add user count */}
                 <p className="text-xs text-muted-foreground">View and manage user accounts</p>
               </CardContent>
            </Card>
         </Link>
         <Link href="/admin/stores">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Manage Stores</CardTitle>
                 <Store className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">...</div> {/* TODO: Add store count */}
                 <p className="text-xs text-muted-foreground">Add, edit, or remove stores</p>
               </CardContent>
            </Card>
         </Link>
         <Link href="/admin/coupons">
           <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Manage Coupons</CardTitle>
                <Tag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">...</div> {/* TODO: Add coupon count */}
                <p className="text-xs text-muted-foreground">Manage store coupons and deals</p>
              </CardContent>
           </Card>
         </Link>
          <Link href="/admin/payouts">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Approve Payouts</CardTitle>
                 <Send className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">...</div> {/* TODO: Add pending payout count */}
                 <p className="text-xs text-muted-foreground">Review and process payout requests</p>
               </CardContent>
            </Card>
          </Link>
        {/* Add more admin sections as needed */}
      </div>

       {/* Placeholder for recent admin activity or key metrics */}
        <Card>
           <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>Key metrics and recent admin actions.</CardDescription>
           </CardHeader>
           <CardContent>
              <p className="text-muted-foreground">Admin overview section coming soon...</p>
              {/* TODO: Add charts or summaries */}
           </CardContent>
        </Card>
    </div>
  );
}


export default function AdminPage() {
    // Wrap the content with the AdminGuard
    return (
        <AdminGuard>
            <AdminDashboardContent />
        </AdminGuard>
    );
}
