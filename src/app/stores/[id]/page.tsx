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
import { AlertCircle, ArrowLeft, ExternalLink, Info, BadgePercent, ScrollText, Star, Users, Clock, CheckSquare, ExternalLinkIcon,ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { trackClick } from '@/lib/actions/tracking'; 
import { v4 as uuidv4 } from 'uuid'; 
import { cn, formatCurrency } from '@/lib/utils'; // Added formatCurrency

// Function to append click ID to a URL
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
  const { user, loading: authLoading } = useAuth(); 

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
        const storeDocRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeDocRef);

        if (!storeSnap.exists()) {
          throw new Error("Store not found.");
        }
        const storeData = { id: storeSnap.id, ...storeSnap.data() } as Store;
        setStore(storeData);

        const couponsCollection = collection(db, 'coupons');
        const q = query(
          couponsCollection,
          where('storeId', '==', storeId),
          where('isActive', '==', true),
          orderBy('isFeatured', 'desc'), 
          orderBy('createdAt', 'desc') 
        );
        const couponSnap = await getDocs(q);
        const couponsData = couponSnap.docs.map(docSnap => ({
            id: docSnap.id,
            store: storeData,
            ...docSnap.data()
        } as Coupon)); 
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

     if (!user && !authLoading) {
        // Save target URL and current path for redirect after login
        sessionStorage.setItem('loginRedirectUrl', store.affiliateLink);
        sessionStorage.setItem('loginRedirectSource', router.asPath); // Use router.asPath for current page
        router.push('/login');
        return;
     }
     if(authLoading){ // Wait for auth to finish
        return;
     }

     const clickId = uuidv4(); 
     const targetUrl = appendClickId(store.affiliateLink, clickId);

     if (user) {
       try {
         await trackClick({
           userId: user.uid,
           storeId: store.id,
           storeName: store.name,
           couponId: null, 
           clickId: clickId,
           affiliateLink: targetUrl, 
           timestamp: new Date(),
         });
         console.log(`Tracked visit for store ${store.id} by user ${user.uid}, clickId: ${clickId}`);
       } catch (trackError) {
         console.error("Error tracking store visit click:", trackError);
       }
     } else {
       console.log("User not logged in, skipping click tracking for store visit.");
     }
     window.open(targetUrl, '_blank', 'noopener,noreferrer');
   };


  if (loading || authLoading) {
    return <StoreDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-4xl text-center py-12">
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
    return <div className="text-center py-16">Store not found.</div>;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-6 hidden md:inline-flex">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>

      {/* Hero Section */}
      <section className="relative rounded-lg overflow-hidden shadow-lg border">
        <Image
          src={store.heroImageUrl || 'https://picsum.photos/seed/storehero/1200/400'}
          alt={`${store.name} Deals`}
          width={1200}
          height={400}
          className="object-cover w-full h-48 md:h-64"
          data-ai-hint={`${store.name} promotional banner`}
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">
            Go to {store.name} via CashEase
          </h1>
        </div>
      </section>

      {/* Store Info &amp; Rating */}
      <section className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 p-4 bg-card rounded-lg shadow-md border">
         {store.logoUrl ? (
           <Image
             src={store.logoUrl}
             alt={`${store.name} Logo`}
             width={100}
             height={50}
             className="object-contain rounded border p-1 bg-white self-center md:self-start"
             data-ai-hint={store.dataAiHint || `${store.name} logo`}
           />
         ) : (
            <div className="w-[100px] h-[50px] bg-muted rounded border flex items-center justify-center text-muted-foreground self-center md:self-start">
                No Logo
            </div>
         )}
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-xl font-semibold mb-1">{store.name} Coupon Codes</h2>
          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{store.description}</p>
          {store.rating && store.ratingCount && (
            <div className="flex items-center justify-center md:justify-start text-sm text-amber-500">
              <Star className="w-4 h-4 fill-current mr-1" />
              <span>{store.rating.toFixed(1)} of 5 | {store.ratingCount} Ratings</span>
            </div>
          )}
        </div>
      </section>

      {/* Cashback Rate Section */}
      <section className="p-4 bg-green-50 border-2 border-green-200 rounded-lg shadow-sm">
        <h3 className="text-xl md:text-2xl font-bold text-green-700 mb-1">Upto {store.cashbackRate} Cashback</h3>
        <p className="text-sm text-green-600 mb-2">on Fashion, Lifestyle, Grocery and more</p>
        {store.detailedCashbackRatesLink && (
          <Link href={store.detailedCashbackRatesLink} target="_blank" rel="noopener noreferrer" className="text-sm text-green-700 hover:text-green-800 font-medium flex items-center">
            View Cashback Rates <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        )}
      </section>

      {/* Top Store Offers */}
      {store.topOffersText && (
        <section className="p-4 bg-card rounded-lg shadow-md border">
          <h3 className="text-lg font-semibold mb-2">Top {store.name} Offers</h3>
          <p className="text-sm text-muted-foreground mb-2">{store.topOffersText}</p>
          {store.offerDetailsLink && (
            <Link href={store.offerDetailsLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline font-medium flex items-center">
              See Offer Details <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          )}
        </section>
      )}
      
      {/* Important Timelines &amp; App Orders */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {store.cashbackTrackingTime && (
          <Card className="text-center">
            <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm font-medium text-muted-foreground">Cashback tracks in</CardTitle></CardHeader>
            <CardContent className="pb-4">
              <p className="text-2xl font-bold">{store.cashbackTrackingTime.split(' ')[0]}</p>
              <p className="text-xs text-muted-foreground">{store.cashbackTrackingTime.split(' ').slice(1).join(' ')}</p>
            </CardContent>
          </Card>
        )}
        {store.cashbackConfirmationTime && (
          <Card className="text-center">
            <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm font-medium text-muted-foreground">Cashback confirms in</CardTitle></CardHeader>
            <CardContent className="pb-4">
              <p className="text-2xl font-bold">{store.cashbackConfirmationTime.split(' ')[0]}</p>
              <p className="text-xs text-muted-foreground">{store.cashbackConfirmationTime.split(' ').slice(1).join(' ')}</p>
            </CardContent>
          </Card>
        )}
        {store.cashbackOnAppOrders !== null && store.cashbackOnAppOrders !== undefined && (
           <Card className="text-center">
            <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm font-medium text-muted-foreground">Cashback on {store.name} app orders?</CardTitle></CardHeader>
            <CardContent className="pb-4">
              <p className={`text-2xl font-bold ${store.cashbackOnAppOrders ? 'text-green-600' : 'text-red-600'}`}>
                {store.cashbackOnAppOrders ? 'YES' : 'NO'}
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Available Coupons */}
      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <BadgePercent className="w-6 h-6 text-primary" /> Available Coupons &amp; Deals
        </h2>
        {coupons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={{...coupon, store: store}} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border">
            <p>No active coupons or deals found for {store.name} right now.</p>
            <p className="mt-2 text-sm">You can still earn cashback by visiting the store!</p>
          </div>
        )}
      </section>
      
      {/* Visit Store Button (Sticky Footer Like) */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-background border-t shadow-top-lg z-10">
        <Button size="lg" className="w-full text-lg font-semibold" onClick={handleVisitStore}>
          Visit {store.name} <ExternalLinkIcon className="ml-2 h-5 w-5" />
        </Button>
      </div>


      {/* Terms &amp; Conditions */}
      {store.terms && (
        <section>
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
             <ScrollText className="w-5 h-5 text-muted-foreground" /> Important Terms &amp; Conditions
          </h2>
          <Card className="bg-muted/50 border">
            <CardContent className="p-4 text-xs text-muted-foreground whitespace-pre-wrap">
              {store.terms}
            </CardContent>
          </Card>
        </section>
      )}

       {/* General Info (Removed, redundant with new terms section) */}
    </div>
  );
}

// Skeleton Loader Component
function StoreDetailSkeleton() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-24 mb-6" /> {/* Back button */}

      {/* Hero Skeleton */}
      <Skeleton className="h-48 md:h-64 w-full rounded-lg" />

      {/* Store Info Skeleton */}
      <section className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 p-4 bg-card rounded-lg shadow-md border">
        <Skeleton className="w-[100px] h-[50px] rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </section>

      {/* Cashback Rate Skeleton */}
      <Skeleton className="h-20 w-full rounded-lg" />

      {/* Top Offers Skeleton */}
      <Skeleton className="h-24 w-full rounded-lg" />
      
      {/* Timelines Skeleton */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </section>

      {/* Coupons Skeleton */}
      <section>
        <Skeleton className="h-8 w-1/2 mb-6" /> 
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>

       {/* Visit Store Button Skeleton */}
       <Skeleton className="h-12 w-full rounded-lg mt-4" />

      {/* Terms Skeleton */}
      <section>
        <Skeleton className="h-7 w-1/3 mb-3" />
        <Card className="bg-muted/50 border">
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}