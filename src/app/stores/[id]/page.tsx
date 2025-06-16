
"use client";

import * as React from 'react';
import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Store, Coupon, Product } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CouponCard from '@/components/coupon-card';
import { AlertCircle, ArrowLeft, ExternalLinkIcon, Info, BadgePercent, ScrollText, Star, Clock, CheckSquare, ChevronRight, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { trackClickClientSide } from '@/lib/actions/tracking'; // Corrected import
import type { TrackClickClientSideData } from '@/lib/actions/tracking';
import { v4 as uuidv4 } from 'uuid';
import { cn, safeToDate, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const [store, setStore] = React.useState<Store | null>(null);
  const [coupons, setCoupons] = React.useState<Coupon[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    if (!storeId || typeof storeId !== 'string') {
      if (isMounted) {
        setError("Invalid store ID provided.");
        setLoading(false);
      }
      return () => { isMounted = false; };
    }

    const fetchStoreAndCoupons = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      if (firebaseInitializationError || !db) {
        if (isMounted) {
          setError(firebaseInitializationError || "Database connection not available.");
          setLoading(false);
        }
        return;
      }

      try {
        const storeDocRef = doc(db, 'stores', storeId);
        const storeSnap = await getDoc(storeDocRef);

        if (!storeSnap.exists() || !storeSnap.data()?.isActive) {
          throw new Error("Store not found or is not active.");
        }
        const storeDataRaw = storeSnap.data();
        const fetchedStore = {
          id: storeSnap.id,
          ...storeDataRaw,
          createdAt: safeToDate(storeDataRaw.createdAt as Timestamp | undefined),
          updatedAt: safeToDate(storeDataRaw.updatedAt as Timestamp | undefined),
        } as unknown as Store;
        if (isMounted) setStore(fetchedStore);

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
          store: fetchedStore, // Embed full store data for CouponCard
          ...docSnap.data(),
          expiryDate: safeToDate(docSnap.data().expiryDate as Timestamp | undefined),
          createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined),
          updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined),
        } as unknown as Coupon));
        if (isMounted) setCoupons(couponsData);

      } catch (err) {
        console.error("Error fetching store details or coupons:", err);
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load store details.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStoreAndCoupons();
    return () => { isMounted = false; };
  }, [storeId]);


  React.useEffect(() => {
    if(error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error,
      });
    }
  }, [error, toast]);

  const handleDirectVisitStore = async () => {
     if (!store || !store.affiliateLink) return;
     if (authLoading) return;

     const clickId = uuidv4();
     const targetUrl = appendClickId(store.affiliateLink, clickId);

     if (user) {
       try {
         const clickData: Omit<TrackClickClientSideData, 'timestamp' | 'userAgent'> = {
           userId: user.uid,
           storeId: store.id,
           storeName: store.name,
           couponId: null,
           productId: null,
           productName: null,
           clickId: clickId,
           affiliateLink: targetUrl,
         };
         await trackClickClientSide(clickData); // Use client-side tracking
       } catch (trackError) {
         console.error("Error tracking store visit click:", trackError);
       }
     }
     window.open(targetUrl, '_blank', 'noopener,noreferrer');
   };


  if (loading || authLoading) {
    return <StoreDetailSkeleton />;
  }

  if (error && !store) {
    return (
      <div className="container mx-auto max-w-4xl text-center py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Store</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-6" onClick={() => router.push('/stores')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Stores
        </Button>
      </div>
    );
  }

  if (!store && !loading) {
    return (
        <div className="text-center py-16 text-muted-foreground">
            Store not found or is no longer available.
            <Button variant="link" onClick={() => router.push('/stores')} className="block mx-auto mt-2">
                Browse All Stores
            </Button>
        </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-6 hidden md:inline-flex">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>

      {store && (
          <section className="relative rounded-lg overflow-hidden shadow-lg border">
            <Image
              src={store.heroImageUrl || 'https://placehold.co/1200x400.png'}
              alt={`${store.name} Deals`}
              width={1200}
              height={400}
              className="object-cover w-full h-48 md:h-64"
              data-ai-hint={`${store.name} promotional banner`}
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-6 md:p-8">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">
                {store.name} Cashback & Offers
              </h1>
            </div>
          </section>
      )}

      {store && (
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
              <h2 className="text-xl font-semibold mb-1">{store.name} Coupons & Cashback</h2>
              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{store.description}</p>
              {store.rating && store.ratingCount ? (
                <div className="flex items-center justify-center md:justify-start text-sm text-amber-500">
                  <Star className="w-4 h-4 fill-current mr-1" />
                  <span>{store.rating.toFixed(1)} of 5 | {store.ratingCount} Ratings</span>
                </div>
              ): (
                <p className="text-xs text-muted-foreground italic">No rating available</p>
              )}
            </div>
          </section>
      )}

      {store && (
          <section className="p-4 bg-green-50 border-2 border-green-200 rounded-lg shadow-sm">
            <h3 className="text-xl md:text-2xl font-bold text-green-700 mb-1">{store.cashbackRate} Cashback</h3>
            <p className="text-sm text-green-600 mb-2">Typically tracked within {store.cashbackTrackingTime || 'standard time'}.</p>
            {store.detailedCashbackRatesLink && (
              <Link href={store.detailedCashbackRatesLink} target="_blank" rel="noopener noreferrer" className="text-sm text-green-700 hover:text-green-800 font-medium flex items-center">
                View Detailed Cashback Rates <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            )}
          </section>
      )}

      {store?.topOffersText && (
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

       {store && (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {store.cashbackTrackingTime && (
              <Card className="text-center">
                <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm font-medium text-muted-foreground">Cashback Tracks In</CardTitle></CardHeader>
                <CardContent className="pb-4">
                  <p className="text-2xl font-bold flex items-center justify-center gap-1"><Clock className="w-5 h-5"/>{store.cashbackTrackingTime.split(' ')[0]}</p>
                  <p className="text-xs text-muted-foreground">{store.cashbackTrackingTime.split(' ').slice(1).join(' ')}</p>
                </CardContent>
              </Card>
            )}
            {store.cashbackConfirmationTime && (
              <Card className="text-center">
                <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm font-medium text-muted-foreground">Cashback Confirms In</CardTitle></CardHeader>
                <CardContent className="pb-4">
                  <p className="text-2xl font-bold flex items-center justify-center gap-1"><CheckSquare className="w-5 h-5"/>{store.cashbackConfirmationTime.split(' ')[0]}</p>
                  <p className="text-xs text-muted-foreground">{store.cashbackConfirmationTime.split(' ').slice(1).join(' ')}</p>
                </CardContent>
              </Card>
            )}
            {store.cashbackOnAppOrders !== null && store.cashbackOnAppOrders !== undefined && (
               <Card className="text-center">
                <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm font-medium text-muted-foreground">Cashback on App Orders?</CardTitle></CardHeader>
                <CardContent className="pb-4">
                  <p className={`text-2xl font-bold ${store.cashbackOnAppOrders ? 'text-green-600' : 'text-red-600'}`}>
                    {store.cashbackOnAppOrders ? 'YES' : 'NO'}
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
       )}

      {store && (
          <div className="sticky bottom-0 left-0 right-0 p-4 bg-background border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1),0_-2px_4px_-2px_rgba(0,0,0,0.06)] z-10">
            <Button size="lg" className="w-full text-lg font-semibold" asChild>
                <Link href={`/stores/${store.id}/products`}>
                    View Products & Get Cashback <ShoppingBag className="ml-2 h-5 w-5" />
                </Link>
            </Button>
             <p className="text-xs text-muted-foreground text-center mt-1">You will be redirected to the product listing for {store.name}.</p>
          </div>
      )}

      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <BadgePercent className="w-6 h-6 text-primary" /> Available Coupons & Deals for {store?.name || 'this store'}
        </h2>
        {loading && coupons.length === 0 ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                 {Array.from({length: 3}).map((_, i) => <Skeleton key={`coupon-skel-${i}`} className="h-40 rounded-lg" />)}
             </div>
        ) : coupons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border">
            <Info className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p>No active coupons or deals found for {store?.name || 'this store'} right now.</p>
            <p className="mt-2 text-sm">You can still earn cashback by visiting the store and shopping for products!</p>
          </div>
        )}
      </section>


      {store?.terms && (
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
    </div>
  );
}

// Skeleton Loader Component
function StoreDetailSkeleton() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-24 mb-6" /> {/* Back button */}
      <Skeleton className="h-48 md:h-64 w-full rounded-lg" />
      <section className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 p-4 bg-card rounded-lg shadow-md border">
        <Skeleton className="w-[100px] h-[50px] rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </section>
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </section>
       <Skeleton className="h-12 w-full rounded-lg mt-4" />
      <section>
        <Skeleton className="h-8 w-1/2 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>
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

    