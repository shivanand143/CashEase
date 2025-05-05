// src/app/page.tsx
"use client"; // Add this directive for client-side interactivity

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
// Correct import for Autoplay
import Autoplay from "embla-carousel-autoplay";
import Image from 'next/image';
import { Search, Tag, ShoppingBag, Percent, ArrowRight, IndianRupee, HandCoins, BadgePercent, Zap, Building2, Gift, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, query, where, limit, orderBy, QueryConstraint, DocumentData, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, Coupon, Banner } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import StoreCard from '@/components/store-card'; // Assuming you have this component
import CouponCard from '@/components/coupon-card'; // Assuming you have this component
import { useRouter } from 'next/navigation'; // Import useRouter
import { trackClick } from '@/lib/actions/tracking'; // Corrected import path


// --- Helper Types ---
interface CouponWithStore extends Coupon {
  store?: Store; // Optional nested store data
}


// --- Helper to fetch data with error handling and loading state ---
async function fetchData<T>(collectionName: string, constraints: QueryConstraint[] = [], orderField?: string, orderDirection?: 'asc' | 'desc', fetchLimit?: number): Promise<{ data: T[]; loading: boolean; error: string | null }> {
  let loading = true;
  let error: string | null = null;
  let data: T[] = [];

  if (!db) {
    return { data, loading: false, error: "Database not initialized." };
  }

  try {
    const dataRef = collection(db, collectionName);
    let q = query(dataRef, ...constraints);

    if (orderField && orderDirection) {
      q = query(q, orderBy(orderField, orderDirection));
    }

    if (fetchLimit) {
      q = query(q, limit(fetchLimit));
    }

    const querySnapshot = await getDocs(q);
    data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    loading = false;
  } catch (err) {
    console.error(`Error fetching ${collectionName}:`, err);
    error = `Failed to load ${collectionName}. Check console for details.`;
    loading = false;
  }
  return { data, loading, error };
}

// --- Helper to fetch coupons and enrich with store data ---
async function fetchCouponsWithStoreData(constraints: QueryConstraint[], orderField?: string, orderDirection?: 'asc' | 'desc', fetchLimit?: number): Promise<{ data: CouponWithStore[]; loading: boolean; error: string | null }> {
  let loading = true;
  let error: string | null = null;
  let coupons: Coupon[] = [];
  let enrichedCoupons: CouponWithStore[] = [];

  if (!db) {
    return { data: enrichedCoupons, loading: false, error: "Database not initialized." };
  }

  try {
    // 1. Fetch Coupons
    const couponResult = await fetchData<Coupon>('coupons', constraints, orderField, orderDirection, fetchLimit);
    coupons = couponResult.data;
    if (couponResult.error) {
      error = couponResult.error; // Propagate error
    }

    // 2. Fetch Store data for each coupon
    if (coupons.length > 0) {
      const storePromises = coupons.map(async (coupon) => {
        if (!coupon.storeId) return coupon; // Return coupon as is if no storeId
        try {
          const storeDocRef = doc(db, 'stores', coupon.storeId);
          const storeSnap = await getDoc(storeDocRef);
          if (storeSnap.exists()) {
            return { ...coupon, store: { id: storeSnap.id, ...storeSnap.data() } as Store };
          }
          return coupon; // Return coupon if store not found
        } catch (storeError) {
          console.error(`Error fetching store ${coupon.storeId} for coupon ${coupon.id}:`, storeError);
          return coupon; // Return coupon even if store fetch fails
        }
      });
      enrichedCoupons = await Promise.all(storePromises);
    }
    loading = false;
  } catch (err) {
    console.error(`Error fetching coupons with store data:`, err);
    error = error || `Failed to load coupons. Check console.`; // Combine errors if needed
    loading = false;
  }

  return { data: enrichedCoupons, loading, error };
}

// Define a dummy trackClick function to avoid import errors
// async function trackClick(data: any): Promise<void> {
//   console.log('Tracking click (dummy function):', data);
//   return Promise.resolve();
// }

// --- HomePage Component ---
export default function HomePage() {
  const { toast } = useToast();
  const router = useRouter(); // Initialize useRouter
  const [banners, setBanners] = React.useState<Banner[]>([]);
  const [featuredStores, setFeaturedStores] = React.useState<Store[]>([]);
  const [topCoupons, setTopCoupons] = React.useState<CouponWithStore[]>([]); // Use enriched type
  const [loadingBanners, setLoadingBanners] = React.useState(true);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [loadingCoupons, setLoadingCoupons] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState(''); // State for search input

  React.useEffect(() => {
    const loadData = async () => {
      setError(null); // Reset error state

      // --- Fetch Banners ---
      const bannerResult = await fetchData<Banner>(
        'banners',
        [where('isActive', '==', true)],
        'order', // Assuming you have an 'order' field for banners
        'asc'
      );
      setBanners(bannerResult.data);
      setLoadingBanners(bannerResult.loading);
      if (bannerResult.error) setError(prev => (prev ? `${prev}\n${bannerResult.error}` : bannerResult.error));

      // --- Fetch Featured Stores ---
      const storeResult = await fetchData<Store>(
        'stores',
        [
          where('isActive', '==', true),
          where('isFeatured', '==', true)
        ],
        'name',
        'asc',
        12 // Limit to 12 featured stores
      );
      setFeaturedStores(storeResult.data);
      setLoadingStores(storeResult.loading);
      if (storeResult.error) setError(prev => (prev ? `${prev}\n${storeResult.error}` : storeResult.error));

      // --- Fetch Top Coupons (enriched with store data) ---
      const couponResult = await fetchCouponsWithStoreData(
        [where('isActive', '==', true)],
        'isFeatured', // Prioritize featured
        'desc',
        6 // Limit to 6 top coupons
        // Consider adding secondary sort like 'createdAt', 'desc' if needed and indexed
      );
      setTopCoupons(couponResult.data);
      setLoadingCoupons(couponResult.loading);
      if (couponResult.error) setError(prev => (prev ? `${prev}\n${couponResult.error}` : couponResult.error));

    };

    loadData();
  }, []); // Empty dependency array ensures this runs once on mount

  React.useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Error Loading Data",
        description: error,
      });
    }
  }, [error, toast]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchTerm.trim()) {
      toast({
        variant: "destructive",
        title: "Search Error",
        description: "Please enter a store or offer name to search.",
      });
      return;
    }
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
  };


  // --- Carousel Plugin ---
  const plugin = React.useRef(
    Autoplay({ delay: 4000, stopOnInteraction: true })
  );

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">

      {/* Hero Section with Search */}
      <section className="text-center py-12 md:py-16 lg:py-20 bg-gradient-to-br from-primary/10 via-background to-secondary/10 rounded-lg shadow-sm overflow-hidden border border-border/50">
        <div className="container px-4 md:px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-foreground">
            Shop Smarter, Earn <span className="text-primary">CashEase</span> Back!
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Get real cashback and find the best coupons for 1500+ online stores in India. Join free today!
          </p>
          <form onSubmit={handleSearchSubmit} className="relative mb-8 max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10 pointer-events-none" />
            <Input
              type="search"
              placeholder="Search Stores & Offers (e.g., Amazon, Myntra...)"
              className="pl-12 pr-24 py-3 w-full h-14 text-lg rounded-full shadow-md focus:ring-2 focus:ring-primary focus:border-border"
              aria-label="Search stores and offers"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-6 rounded-full text-base font-semibold">Search</Button>
          </form>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Button size="lg" asChild className="w-full sm:w-auto shadow-md hover:shadow-lg transition-shadow duration-300">
              <Link href="/signup" className="flex items-center justify-center gap-2">
                <HandCoins className="h-5 w-5" /> Join Free & Start Earning
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/stores" className="flex items-center justify-center gap-2">
                <ShoppingBag className="h-5 w-5" /> Browse All Stores
              </Link>
            </Button>
          </div>
        </div>
      </section>

       {/* --- Banner Carousel Section --- */}
       <section className="container px-4 md:px-6">
         <h2 className="text-3xl font-bold text-center mb-6 md:mb-8 flex items-center justify-center gap-2">
           <TrendingUp className="text-primary w-7 h-7"/> Today's Top Deals
         </h2>
         {loadingBanners ? (
           <Skeleton className="h-48 md:h-64 lg:h-80 w-full rounded-lg" />
         ) : banners.length > 0 ? (
           <Carousel
             plugins={[plugin.current]}
             className="w-full"
             onMouseEnter={plugin.current.stop}
             onMouseLeave={plugin.current.reset}
             opts={{
               align: "start",
               loop: true,
             }}
           >
             <CarouselContent>
               {banners.map((banner, index) => (
                 <CarouselItem key={banner.id || index}>
                   <Link href={banner.link || '#'} target={banner.link ? "_blank" : undefined} rel="noopener noreferrer" className="block relative aspect-[2/1] md:aspect-[3/1] lg:aspect-[4/1] overflow-hidden rounded-lg shadow-md group border border-border/30">
                     <Image
                       src={banner.imageUrl || 'https://picsum.photos/seed/placeholderbanner/1200/400'} // Fallback image
                       alt={banner.altText || 'Promotional Banner'}
                       fill
                       sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
                       className="object-cover transition-transform duration-300 group-hover:scale-105"
                       priority={index === 0} // Prioritize loading the first banner
                       data-ai-hint={banner.dataAiHint || 'promotional banner sale offer'}
                     />
                     {(banner.title || banner.subtitle) && (
                       <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 md:p-6 flex flex-col justify-end">
                         {banner.title && <h3 className="text-white text-xl md:text-2xl lg:text-3xl font-bold mb-1 drop-shadow-lg">{banner.title}</h3>}
                         {banner.subtitle && <p className="text-white text-sm md:text-base lg:text-lg opacity-90 drop-shadow-md max-w-xl">{banner.subtitle}</p>}
                       </div>
                     )}
                   </Link>
                 </CarouselItem>
               ))}
             </CarouselContent>
             <CarouselPrevious className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background border-border shadow-md disabled:opacity-50" />
             <CarouselNext className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background border-border shadow-md disabled:opacity-50" />
           </Carousel>
         ) : (
            <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg">
                No deals available right now. Check back soon!
            </div>
         ) /* Don't show section if no banners, provide feedback */}
       </section>


      {/* --- How it Works Section --- */}
      <section className="container px-4 md:px-6 py-12">
        <h2 className="text-3xl font-bold text-center mb-10">How CashEase Works - Simple & Rewarding!</h2>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
          {/* Step 1 */}
          <Card className="text-center border-border/80 shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col items-center p-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4">
              <Search className="w-8 h-8" />
            </div>
            <CardHeader className="p-0 mb-2">
              <CardTitle className="text-xl font-semibold">1. Find Your Store</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CardDescription>Browse 1500+ stores or search for your favorite brands offering cashback.</CardDescription>
            </CardContent>
          </Card>
          {/* Step 2 */}
          <Card className="text-center border-border/80 shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col items-center p-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <CardHeader className="p-0 mb-2">
              <CardTitle className="text-xl font-semibold">2. Shop via CashEase</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CardDescription>Click the link on CashEase & shop directly on the store's site as usual.</CardDescription>
            </CardContent>
          </Card>
          {/* Step 3 */}
          <Card className="text-center border-border/80 shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col items-center p-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4">
              <IndianRupee className="w-8 h-8" />
            </div>
            <CardHeader className="p-0 mb-2">
              <CardTitle className="text-xl font-semibold">3. Earn Real Cashback</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CardDescription>Cashback tracks automatically & gets paid to your bank or as gift cards.</CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* --- Featured Stores Section --- */}
      <section className="container px-4 md:px-6">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="text-primary w-7 h-7" /> Featured Stores
          </h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/stores" className="flex items-center gap-1">
              View All Stores <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
        {loadingStores ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : featuredStores.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {featuredStores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">No featured stores available right now. Check back soon!</p>
        )}
      </section>

      {/* --- Top Coupons Section --- */}
      <section className="container px-4 md:px-6">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Tag className="text-primary w-7 h-7" /> Top Coupons & Offers
          </h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/coupons" className="flex items-center gap-1">
              View All Coupons <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
        {loadingCoupons ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : topCoupons.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {topCoupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">No top coupons available at the moment.</p>
        )}
      </section>

      {/* --- Maximize Savings Section --- */}
      <section className="container px-4 md:px-6 py-12 bg-muted/50 rounded-lg border border-border/50">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4 flex items-center gap-2"><Zap className="text-accent w-7 h-7" />Maximize Your Savings</h2>
            <p className="text-muted-foreground mb-6">
              Beyond cashback, discover exclusive deals, bank offers, and special promotions updated daily. Never miss a chance to save more!
            </p>
            <div className="flex flex-wrap gap-4">
              <Button asChild>
                <Link href="/deals">Explore Hot Deals</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/categories">Browse Categories</Link>
              </Button>
            </div>
          </div>
          <div className="flex justify-center order-first md:order-last">
            <Image
              src="https://picsum.photos/seed/savingspile/400/300"
              alt="Savings Illustration with coins and piggy bank"
              width={400}
              height={300}
              className="rounded-lg shadow-md"
              data-ai-hint="savings money deal piggy bank illustration"
            />
          </div>
        </div>
      </section>

       {/* --- Referral Section --- */}
       <section className="container px-4 md:px-6 py-12">
         <div className="grid md:grid-cols-2 gap-8 items-center bg-gradient-to-r from-secondary/10 to-primary/10 p-8 rounded-lg border border-border/50 shadow-sm">
           <div className="flex justify-center">
             <Image
               src="https://picsum.photos/seed/referralgift/400/300"
               alt="Referral gift box illustration"
               width={400}
               height={300}
               className="rounded-lg shadow-md"
               data-ai-hint="referral gift box friends illustration"
             />
           </div>
           <div>
             <h2 className="text-3xl font-bold mb-4 flex items-center gap-2"><Gift className="text-secondary w-7 h-7" /> Refer & Earn More!</h2>
             <p className="text-muted-foreground mb-6">
               Invite your friends to CashEase and earn bonus cashback when they sign up and make their first purchase. It's a win-win!
             </p>
             <Button asChild>
               <Link href="/dashboard/referrals">Get Your Referral Link</Link>
             </Button>
           </div>
         </div>
       </section>


    </div>
  );
}
