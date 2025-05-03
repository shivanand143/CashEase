// src/app/admin/page.tsx
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Users, Store, Tag, Send, ListOrdered } from 'lucide-react'; // Added ListOrdered
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import AdminGuard from '@/components/guards/admin-guard'; // Import the guard

// TODO: Fetch actual counts for the cards
// import { collection, getCountFromServer } from 'firebase/firestore';
// import { db } from '@/lib/firebase/config';

function AdminDashboardContent() {
   // Placeholder counts
   const userCount = '...';
   const storeCount = '...';
   const couponCount = '...';
   const transactionCount = '...';
   const pendingPayoutCount = '...';

   // Uncomment and adapt to fetch real counts
   // React.useEffect(() => {
   //   const fetchCounts = async () => {
   //     try {
   //       const usersCol = collection(db, 'users');
   //       const storesCol = collection(db, 'stores');
   //       const couponsCol = collection(db, 'coupons');
   //       // ... add queries for transactions, pending payouts ...
   //
   //       const [userSnap, storeSnap, couponSnap] = await Promise.all([
   //         getCountFromServer(usersCol),
   //         getCountFromServer(storesCol),
   //         getCountFromServer(couponsCol),
   //         // ... fetch other counts
   //       ]);
   //
   //       setUserCount(userSnap.data().count.toString());
   //       setStoreCount(storeSnap.data().count.toString());
   //       setCouponCount(couponSnap.data().count.toString());
   //       // ... set other counts
   //
   //     } catch (error) {
   //       console.error("Error fetching dashboard counts:", error);
   //     }
   //   };
   //   fetchCounts();
   // }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
         {/* User Card */}
         <Link href="/admin/users" className="block hover:shadow-md transition-shadow rounded-lg">
            <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Manage Users</CardTitle>
                 <Users className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{userCount}</div>
                 <p className="text-xs text-muted-foreground">View and manage user accounts</p>
               </CardContent>
            </Card>
         </Link>
         {/* Store Card */}
         <Link href="/admin/stores" className="block hover:shadow-md transition-shadow rounded-lg">
            <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Manage Stores</CardTitle>
                 <Store className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{storeCount}</div>
                 <p className="text-xs text-muted-foreground">Add, edit, or remove stores</p>
               </CardContent>
            </Card>
         </Link>
         {/* Coupon Card */}
         <Link href="/admin/coupons" className="block hover:shadow-md transition-shadow rounded-lg">
           <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Manage Coupons</CardTitle>
                <Tag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{couponCount}</div>
                <p className="text-xs text-muted-foreground">Manage store coupons and deals</p>
              </CardContent>
           </Card>
         </Link>
          {/* Transaction Card */}
           <Link href="/admin/transactions" className="block hover:shadow-md transition-shadow rounded-lg">
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                  <ListOrdered className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{transactionCount}</div>
                  <p className="text-xs text-muted-foreground">View and manage transactions</p>
                </CardContent>
             </Card>
           </Link>
          {/* Payout Card */}
          <Link href="/admin/payouts" className="block hover:shadow-md transition-shadow rounded-lg">
            <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Approve Payouts</CardTitle>
                 <Send className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">{pendingPayoutCount}</div>
                 <p className="text-xs text-muted-foreground">Review and process requests</p>
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
