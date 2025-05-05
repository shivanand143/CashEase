"use client";

import * as React from 'react';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, Coupon } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CouponCard from '@/components/coupon-card';
import { AlertCircle, ArrowLeft, ExternalLink, Info, BadgePercent, ScrollText } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { trackClick } from '@/lib/actions/tracking'; // Import tracking function
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator

// Function to append click ID to a URL (same as in coupon-card)
const appendClickId = (url: string, clickId: string): string => {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('subid', clickId);
    urlObj.searchParams.set('aff_sub', clickId);
    return urlObj.toString();
  } catch (e) {
    console.warn("Invalid URL for click tracking:", url);
    return url;
  }
};

export default function StoreDetailPage() {
  const params = useParams();
  const storeId = params.id as string;
  const router = useRouter();
  const { user } = useAuth(); // Get user for tracking

  const [store, setStore] = React.useState<Store | null>(null);
  const [coupons, setCoupons] = React.useState<Coupon[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!storeId || typeof storeId !== 'string') {
      setError("Invalid store ID provided.");
      setLoading(false);
      return;
    }

    const fetchStoreAndCoupons = async () => {
      setLoading(true);
      setError(null);

      if (!db) {
        setError("Database connection not available.");
        setLoading(false);
        return;
      }

      try {
        // Fetch Store Details
        const storeDocRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeDocRef);

        if (!storeSnap.exists()) {
          throw new Error("Store not found.");
        }
        const storeData = { id: storeSnap.id, ...storeSnap.data() } as Store;
        setStore(storeData);

        // Fetch Active Coupons for this Store
        const couponsCollection = collection(db, 'coupons');
        const q = query(
          couponsCollection,
          where('storeId', '==', storeId),
          where('isActive', '==', true),
          orderBy('isFeatured', 'desc'), // Show featured first
          orderBy('createdAt', 'desc') // Then by creation date
        );
        const couponSnap = await getDocs(q);
        const couponsData = couponSnap.docs.map(docSnap => ({
            id: docSnap.id,
             // Add store data to each coupon for CouponCard (essential for tracking)
            store: storeData,
            ...docSnap.data()
        } as Coupon)); // Cast assumes CouponCard expects Coupon type
        setCoupons(couponsData);

      } catch (err) {
        console.error("Error fetching store details or coupons:", err);
        setError(err instanceof Error ? err.message : "Failed to load store details.");
      } finally {
        setLoading(false);
      }
    };

    fetchStoreAndCoupons();
  }, [storeId]);

   const handleVisitStore = async () => {
     if (!store || !store.affiliateLink) return;

     const clickId = uuidv4(); // Generate unique click ID
     const targetUrl = appendClickId(store.affiliateLink, clickId);

     // --- Track Click ---
     if (user) {
       try {
         await trackClick({
           userId: user.uid,
           storeId: store.id,
           storeName: store.name,
           couponId: null, // Not tied to a specific coupon here
           clickId: clickId,
           affiliateLink: targetUrl, // Store the final link clicked
           timestamp: new Date(),
         });
         console.log(`Tracked visit for store ${store.id} by user ${user.uid}, clickId: ${clickId}`);
       } catch (trackError) {
         console.error("Error tracking store visit click:", trackError);
         // Optionally notify the user or log centrally, but don't block redirection
       }
     } else {
       console.log("User not logged in, skipping click tracking for store visit.");
       // Maybe show a toast asking user to log in for tracking?
     }

     // --- Redirect ---
     window.open(targetUrl, '_blank', 'noopener,noreferrer');
   };


  if (loading) {
    return <StoreDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-3xl text-center py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-6" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  if (!store) {
    // Should be covered by error state, but good practice
    return <div className="text-center py-16">Store not found.</div>;
  }

  return (
    <div className="space-y-8">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Stores
       </Button>

      {/* Store Header */}
      <section className="flex flex-col md:flex-row items-center gap-6 md:gap-8 p-6 bg-card rounded-lg shadow-md border">
         {store.logoUrl ? (
           <Image
             src={store.logoUrl}
             alt={`${store.name} Logo`}
             width={150}
             height={75}
             className="object-contain rounded border p-2 bg-white"
             data-ai-hint={store.dataAiHint || `${store.name} logo`}
           />
         ) : (
            <div className="w-[150px] h-[75px] bg-muted rounded border flex items-center justify-center text-muted-foreground">
                No Logo
            </div>
         )}
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{store.name}</h1>
          <p className="text-lg text-primary font-semibold mb-3">{store.cashbackRate}</p>
          <p className="text-muted-foreground text-sm mb-4">{store.description}</p>
          <Button size="lg" onClick={handleVisitStore}>
             Visit Store & Activate Cashback <ExternalLink className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Coupons & Deals */}
      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <BadgePercent className="w-6 h-6 text-primary" /> Available Coupons & Deals for {store.name}
        </h2>
        {coupons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {coupons.map((coupon) => (
              // Pass the enriched coupon (which includes store data) to CouponCard
              <CouponCard key={coupon.id} coupon={{...coupon, store: store}} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border">
            <p>No active coupons or deals found for {store.name} right now.</p>
            <p className="mt-2 text-sm">You can still earn cashback by visiting the store!</p>
             <Button size="sm" onClick={handleVisitStore} className="mt-4">
                 Visit {store.name} Now <ExternalLink className="ml-2 h-4 w-4" />
             </Button>
          </div>
        )}
      </section>

      {/* Terms & Conditions */}
      {store.terms && (
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
             <ScrollText className="w-6 h-6 text-primary" /> Cashback Terms & Conditions
          </h2>
          <Card className="bg-muted/50 border">
            <CardContent className="p-6 text-sm text-muted-foreground whitespace-pre-wrap">
              {store.terms}
            </CardContent>
          </Card>
        </section>
      )}

       {/* General Info */}
       <section>
         <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
             <Info className="w-6 h-6 text-primary" /> Important Information
         </h2>
         <Card className="border-primary/20 bg-primary/5">
           <CardContent className="p-6 space-y-3 text-sm">
             <p> <span className="font-semibold">Tracking Time:</span> Cashback typically tracks within 72 hours of purchase.</p>
             <p> <span className="font-semibold">Confirmation Time:</span> It may take 30-90 days for cashback to be confirmed by {store.name}.</p>
             <p> <span className="font-semibold">Missing Cashback:</span> If your cashback doesn't track, please file a missing cashback claim within 10 days of purchase via your dashboard.</p>
             <p> <span className="font-semibold">Eligibility:</span> Ensure you click through from CashEase *before* adding items to your cart. Using external coupons may invalidate cashback.</p>
             <p className="text-xs text-muted-foreground pt-2">Cashback rates and terms are subject to change by the retailer.</p>
           </CardContent>
         </Card>
       </section>
    </div>
  );
}

// Skeleton Loader Component
function StoreDetailSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-32" /> {/* Back button */}

      {/* Store Header Skeleton */}
      <section className="flex flex-col md:flex-row items-center gap-6 md:gap-8 p-6 bg-card rounded-lg shadow-md border">
        <Skeleton className="w-[150px] h-[75px] rounded" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-10 w-3/4" /> {/* Title */}
          <Skeleton className="h-6 w-1/2" /> {/* Rate */}
          <Skeleton className="h-4 w-full" /> {/* Description line 1 */}
          <Skeleton className="h-4 w-5/6" /> {/* Description line 2 */}
          <Skeleton className="h-12 w-48" /> {/* Button */}
        </div>
      </section>

      {/* Coupons Skeleton */}
      <section>
        <Skeleton className="h-8 w-1/2 mb-6" /> {/* Section Title */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>

      {/* Terms Skeleton */}
      <section>
        <Skeleton className="h-8 w-1/3 mb-4" /> {/* Section Title */}
        <Card className="bg-muted/50 border">
          <CardContent className="p-6 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}