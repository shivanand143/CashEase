
// src/app/page.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import Image from 'next/image';
import { Search, Tag, ShoppingBag, ArrowRight, IndianRupee, HandCoins, BadgePercent, Zap, Building2, Gift, TrendingUp, ExternalLink, ScrollText, Info, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, query, where, limit, orderBy, QueryConstraint, DocumentData, getDoc, doc, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Store, Coupon, Banner, Category, Product } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import StoreCard from '@/components/store-card';
import CouponCard from '@/components/coupon-card';
import { useRouter } from 'next/navigation';
import { safeToDate } from '@/lib/utils';
import { ProductCard } from '@/components/product-card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';


// --- Helper Types ---
interface CouponWithStore extends Coupon {
  store?: Store;
}

// --- Helper to fetch data ---
async function fetchData<T>(collectionName: string, constraints: QueryConstraint[] = [], orderFields: { field: string, direction: 'asc' | 'desc' }[] = [], fetchLimit?: number): Promise<T[]> {
    let data: T[] = [];
    if (!db || firebaseInitializationError) {
        console.warn(`Firestore DB not initialized or error during init when fetching ${collectionName}. Error: ${firebaseInitializationError}`);
        return [];
    }
    try {
        const dataRef = collection(db, collectionName);
        let qConstraints = [...constraints];
        orderFields.forEach(order => qConstraints.push(orderBy(order.field, order.direction)));
        if (fetchLimit) {
            qConstraints.push(limit(fetchLimit));
        }
        
        const q = query(dataRef, ...qConstraints);
        const querySnapshot = await getDocs(q);
        data = querySnapshot.docs.map(docSnap => {
            const docData = docSnap.data();
            const convertedData = Object.keys(docData).reduce((acc, key) => {
                if (docData[key] instanceof Timestamp) {
                    acc[key] = safeToDate(docData[key]);
                } else {
                    acc[key] = docData[key];
                }
                return acc;
            }, {} as any);
            return { id: docSnap.id, ...convertedData } as T;
        });
    } catch (err) {
        console.error(`Error fetching ${collectionName}:`, err);
        throw new Error(`Failed to fetch ${collectionName}`);
    }
    return data;
}

// --- Helper to fetch coupons and enrich with store data ---
async function fetchCouponsWithStoreData(constraints: QueryConstraint[], orderFields: { field: string, direction: 'asc' | 'desc' }[] = [], fetchLimit?: number): Promise<CouponWithStore[]> {
    let coupons: Coupon[] = [];
    let enrichedCoupons: CouponWithStore[] = [];
    if (!db || firebaseInitializationError) {
        console.warn(`Firestore DB not initialized or error during init in fetchCouponsWithStoreData. Error: ${firebaseInitializationError}`);
        return [];
    }
    try {
        coupons = await fetchData<Coupon>('coupons', constraints, orderFields, fetchLimit);
        if (coupons.length > 0) {
            const storeCache = new Map<string, Store>();
            const storePromises = coupons.map(async (coupon) => {
                if (!coupon.storeId) return coupon;
                if (storeCache.has(coupon.storeId)) {
                    return { ...coupon, store: storeCache.get(coupon.storeId)! };
                }
                if (!db) {
                  console.warn("DB not available for store fetch in fetchCouponsWithStoreData");
                  return coupon;
                }
                try {
                    const storeDocRef = doc(db, 'stores', coupon.storeId);
                    const storeSnap = await getDoc(storeDocRef);
                    if (storeSnap.exists()) {
                         const storeDataRaw = storeSnap.data();
                         const storeData = {
                             id: storeSnap.id,
                             ...storeDataRaw,
                             createdAt: safeToDate(storeDataRaw.createdAt),
                             updatedAt: safeToDate(storeDataRaw.updatedAt),
                         } as Store;
                        storeCache.set(coupon.storeId, storeData);
                        return { ...coupon, store: storeData };
                    }
                    return coupon;
                } catch (storeError) {
                    console.error(`Error fetching store ${coupon.storeId} for coupon ${coupon.id}:`, storeError);
                    return coupon;
                }
            });
            enrichedCoupons = await Promise.all(storePromises);
        }
    } catch (err) {
        console.error("Error in fetchCouponsWithStoreData:", err);
         throw new Error("Failed to fetch coupons with store data");
    }
    return enrichedCoupons;
}


// --- HomePage Component ---
export default function HomePage() {
  const { toast } = useToast();
  const router = useRouter();
  const [banners, setBanners] = React.useState<Banner[]>([]);
  const [featuredStores, setFeaturedStores] = React.useState<Store[]>([]);
  const [topCoupons, setTopCoupons] = React.useState<CouponWithStore[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [amazonTodaysPicks, setAmazonTodaysPicks] = React.useState<Product[]>([]);
  const [amazonStoreData, setAmazonStoreData] = React.useState<Store | null>(null);

  const [loadingBanners, setLoadingBanners] = React.useState(true);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [loadingCoupons, setLoadingCoupons] = React.useState(true);
  const [loadingCategories, setLoadingCategories] = React.useState(true);
  const [loadingTodaysPicks, setLoadingTodaysPicks] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');

  React.useEffect(() => {
    let isMounted = true;
    const loadAllData = async () => {
      if (firebaseInitializationError) {
        if (isMounted) {
            setPageError(`Failed to connect to the database: ${firebaseInitializationError}`);
            setLoadingBanners(false); setLoadingStores(false); setLoadingCoupons(false); setLoadingCategories(false); setLoadingTodaysPicks(false);
        }
        return;
      }
      if (!db) {
        if(isMounted) {
            setPageError("Database not available. Please try again later.");
            setLoadingBanners(false); setLoadingStores(false); setLoadingCoupons(false); setLoadingCategories(false); setLoadingTodaysPicks(false);
        }
        return;
      }

      setLoadingBanners(true); setLoadingStores(true); setLoadingCoupons(true); setLoadingCategories(true); setLoadingTodaysPicks(true);
      setPageError(null);
      let combinedErrorMessages: string[] = [];

      // Define Amazon Store ID/Slug (ensure this matches your Firestore data for Amazon store)
      const amazonStoreIdentifier = "amazon"; // Example: using 'amazon' as the document ID or a specific slug

      try {
        const bannerFetchPromise = fetchData<Banner>(
          'banners', [where('isActive', '==', true)], [{field: 'order', direction: 'asc'}], 5
        ).catch(err => { console.error("Banner fetch failed:", err); combinedErrorMessages.push("banners"); return []; });

        const storeFetchPromise = fetchData<Store>(
          'stores', [where('isActive', '==', true), where('isFeatured', '==', true)], [{field: 'name', direction: 'asc'}], 12
        ).catch(err => { console.error("Store fetch failed:", err); combinedErrorMessages.push("stores"); return []; });

        const couponFetchPromise = fetchCouponsWithStoreData(
          [where('isActive', '==', true), where('isFeatured', '==', true)], [{field: 'createdAt', direction: 'desc'}], 6
        ).catch(err => { console.error("Coupon fetch failed:", err); combinedErrorMessages.push("coupons"); return []; });

         const categoryFetchPromise = fetchData<Category>(
             'categories', [where('isActive', '==', true)], 
             [{field: 'order', direction: 'asc'}, {field: 'name', direction: 'asc'}], 12
         ).catch(err => { console.error("Category fetch failed:", err); combinedErrorMessages.push("categories"); return []; });
        
        const amazonStoreFetchPromise = getDoc(doc(db, 'stores', amazonStoreIdentifier))
            .then(docSnap => {
                if (docSnap.exists()) {
                    return { id: docSnap.id, ...docSnap.data() } as Store;
                }
                console.warn(`Amazon store with ID/slug '${amazonStoreIdentifier}' not found.`);
                return null;
            })
            .catch(err => { console.error("Amazon store data fetch failed:", err); combinedErrorMessages.push("amazon store details"); return null; });

        const [bannerData, storeData, couponData, categoryData, fetchedAmazonStoreData] = await Promise.all([
            bannerFetchPromise, storeFetchPromise, couponFetchPromise, categoryFetchPromise, amazonStoreFetchPromise
        ]);

        if (isMounted) {
          setBanners(bannerData);
          setFeaturedStores(storeData);
          setTopCoupons(couponData);
          setCategories(categoryData);
          setAmazonStoreData(fetchedAmazonStoreData);

          if (fetchedAmazonStoreData) { // Only fetch picks if Amazon store was found
            fetchData<Product>(
              'products',
              [
                where('storeId', '==', fetchedAmazonStoreData.id),
                where('isTodaysPick', '==', true),
                where('isActive', '==', true)
              ],
              [{ field: 'createdAt', direction: 'desc' }],
              6
            ).then(picksData => {
              if(isMounted) setAmazonTodaysPicks(picksData);
            }).catch(err => {
              console.error("Today's Picks fetch failed:", err);
              combinedErrorMessages.push("today's picks");
            }).finally(() => {
              if(isMounted) setLoadingTodaysPicks(false);
            });
          } else {
             if(isMounted) {
                setAmazonTodaysPicks([]);
                setLoadingTodaysPicks(false); // No store, so no picks to load
             }
          }

          if (combinedErrorMessages.length > 0) {
             setPageError(`Failed to load some data sections: ${combinedErrorMessages.join(', ')}.`);
          }
        }
      } catch (err) {
        if (isMounted) {
           console.error("Error loading page data:", err);
           setPageError("Failed to load page data. Please try again.");
        }
      } finally {
        if (isMounted) {
          setLoadingBanners(false); setLoadingStores(false); setLoadingCoupons(false); setLoadingCategories(false);
          // setLoadingTodaysPicks is handled within its own fetch block
        }
      }
    };

    loadAllData();
    return () => { isMounted = false; };
  }, []);


  React.useEffect(() => {
    if (pageError) {
      toast({
        variant: "destructive",
        title: "Error Loading Data",
        description: pageError,
        duration: 7000,
      });
    }
  }, [pageError, toast]);

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

  const plugin = React.useRef(
    Autoplay({ delay: 4000, stopOnInteraction: true })
  );

  const isPageLoading = loadingBanners || loadingStores || loadingCoupons || loadingCategories || loadingTodaysPicks;

  return (
    <div className="container mx-auto px-4 py-8 space-y-12 md:space-y-16 lg:space-y-20">
       <section className="relative text-center py-12 md:py-16 lg:py-20 bg-gradient-to-br from-primary/10 via-background to-secondary/10 rounded-lg shadow-sm overflow-hidden border border-border/50">
           <div className="container relative z-10 px-4 md:px-6">
             <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-foreground">
               Shop Smarter, Earn <span className="text-primary">CashEase</span> Back!
             </h1>
             <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
               Get real cashback and find the best coupons for 1500+ online stores in India. Join free today!
             </p>
             <Card className="max-w-2xl mx-auto shadow-md border mb-8">
                <CardContent className="p-2 sm:p-3">
                     <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center">
                       <Search className="ml-2 h-5 w-5 text-muted-foreground hidden sm:block" />
                       <Input
                         type="search"
                         name="search"
                         placeholder="Search stores, brands, products..."
                         className="flex-grow h-12 text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none pl-2 sm:pl-0"
                         aria-label="Search stores and offers"
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                       />
                       <Button type="submit" className="h-10 px-4 sm:px-6 text-sm sm:text-base">Search</Button>
                     </form>
                </CardContent>
             </Card>
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

        {pageError && !isPageLoading && (
          <Alert variant="destructive" className="mt-8">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Data Loading Issues</AlertTitle>
            <AlertDescription>
              {pageError} Some content may be missing. Please try refreshing the page. If the problem persists, contact support.
            </AlertDescription>
          </Alert>
       )}

       <section>
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
               loop: banners.length > 1,
             }}
           >
             <CarouselContent>
               {banners.map((banner, index) => (
                 <CarouselItem key={banner.id || index}>
                   <Link href={banner.link || '#'} target={banner.link ? "_blank" : undefined} rel="noopener noreferrer" className="block relative aspect-[2/1] md:aspect-[3/1] lg:aspect-[10/3] overflow-hidden rounded-lg shadow-md group border border-border/30">
                     <Image
                       src={banner.imageUrl || 'https://placehold.co/1200x400.png'}
                       alt={banner.altText || 'Promotional Banner'}
                       fill
                       sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
                       className="object-cover transition-transform duration-300 group-hover:scale-105"
                       priority={index === 0}
                       data-ai-hint={banner.dataAiHint || 'promotional banner sale offer'}
                       onError={(e) => ((e.target as HTMLImageElement).src = 'https://placehold.co/1200x400.png')}
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
             {banners.length > 1 && (
               <>
                 <CarouselPrevious className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background border-border shadow-md disabled:opacity-50" />
                 <CarouselNext className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background border-border shadow-md disabled:opacity-50" />
               </>
             )}
           </Carousel>
         ) : !pageError ? ( 
             <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg border">
                No special deals featured right now. Check back soon!
             </div>
          ) : null }
       </section>

      <section className="py-12 text-center bg-muted/30 rounded-lg border">
        <h2 className="text-3xl font-bold mb-4">How CashEase Works</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">Earn cashback in 3 simple steps!</p>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
           <div className="flex flex-col items-center space-y-2 p-4">
               <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-3">
                   <Search className="w-8 h-8"/>
               </div>
               <h3 className="text-lg font-semibold">1. Find Store</h3>
               <p className="text-sm text-muted-foreground">Search & click out via CashEase</p>
           </div>
           <div className="flex flex-col items-center space-y-2 p-4">
               <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-3">
                  <ShoppingBag className="w-8 h-8"/>
               </div>
               <h3 className="text-lg font-semibold">2. Shop</h3>
               <p className="text-sm text-muted-foreground">Buy as usual on the retailer's site</p>
           </div>
            <div className="flex flex-col items-center space-y-2 p-4">
               <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-3">
                   <IndianRupee className="w-8 h-8"/>
               </div>
               <h3 className="text-lg font-semibold">3. Earn</h3>
               <p className="text-sm text-muted-foreground">Get cashback in your account!</p>
           </div>
        </div>
         <Button variant="link" asChild className="mt-6">
             <Link href="/how-it-works">Learn More <ArrowRight className="ml-1 w-4 h-4"/></Link>
         </Button>
      </section>

        <section>
           <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
               <h2 className="text-3xl font-bold flex items-center gap-2">
                 <Building2 className="text-primary w-7 h-7" /> Popular Categories
               </h2>
               <Button variant="outline" size="sm" asChild>
                 <Link href="/categories" className="flex items-center gap-1">
                   View All Categories <ArrowRight className="w-4 h-4" />
                 </Link>
               </Button>
           </div>
           {loadingCategories ? (
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                 {Array.from({ length: 12 }).map((_, index) => (
                   <Skeleton key={`cat-skel-${index}`} className="h-32 rounded-lg" />
                 ))}
               </div>
           ) : categories.length > 0 ? (
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                 {categories.map((category) => (
                   <Link key={category.id} href={`/category/${category.slug}`} legacyBehavior>
                     <a className="block group">
                       <Card className="text-center hover:shadow-md transition-shadow duration-300 h-full flex flex-col items-center justify-center p-4 border rounded-lg bg-card hover:border-primary/50">
                         {category.imageUrl ? (
                           <Image
                             src={category.imageUrl}
                             alt={`${category.name} category`}
                             width={60}
                             height={60}
                             className="object-contain mb-3 h-16 w-16 rounded-md"
                             data-ai-hint={`${category.name} icon illustration`}
                             onError={(e) => ((e.target as HTMLImageElement).src = 'https://placehold.co/60x60.png')}
                           />
                         ) : (
                           <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-3 border">
                             <Building2 className="w-8 h-8 text-muted-foreground" />
                           </div>
                         )}
                         <p className="font-medium text-sm text-foreground">{category.name}</p>
                       </Card>
                     </a>
                   </Link>
                 ))}
               </div>
           ) : !pageError ? (
               <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">No categories found.</p>
           ): null}
       </section>

      <section>
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <ShoppingBag className="text-primary w-7 h-7" /> Featured Stores
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
              <Skeleton key={`store-skel-${index}`} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : featuredStores.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {featuredStores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        ) : !pageError ? (
          <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">No featured stores available right now.</p>
        ) : null}
      </section>

      <section>
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
              <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : topCoupons.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {topCoupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        ) : !pageError ? (
          <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">No top coupons available at the moment.</p>
        ): null}
      </section>

       <section>
         <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2">
                <Image src="https://placehold.co/100x30.png?text=Amazon" alt="Amazon Logo" width={100} height={30} data-ai-hint="amazon brand logo" />
                Today's Picks
            </h2>
            {amazonStoreData && amazonStoreData.id ? (
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/stores/${amazonStoreData.id}/products`} className="flex items-center gap-1">
                        View All Amazon Offers <ArrowRight className="w-4 h-4" />
                    </Link>
                </Button>
            ) : amazonStoreData?.affiliateLink ? (
                <Button variant="outline" size="sm" asChild>
                    <a href={amazonStoreData.affiliateLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                        Shop on Amazon <ExternalLink className="w-4 h-4" />
                    </a>
                </Button>
            ) : null }
         </div>
          {loadingTodaysPicks ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={`todayspick-skel-page-${index}`} className="h-64 rounded-lg" />
                  ))}
              </div>
          ) : amazonTodaysPicks.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
                  {amazonTodaysPicks.map((product) => (
                      <ProductCard key={product.id} product={product} storeContext={amazonStoreData || undefined} />
                  ))}
              </div>
          ) : !pageError ? (
              <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">No Today's Picks available from Amazon right now.</p>
          ) : null}
       </section>

       <section className="grid md:grid-cols-2 gap-8">
           <Card className="shadow-sm bg-gradient-to-tr from-amber-50 to-yellow-100 border-amber-300">
               <CardHeader>
                   <CardTitle className="flex items-center gap-2 text-amber-800"><Zap className="text-amber-600 w-6 h-6" />Maximize Your Savings</CardTitle>
                   <CardDescription className="text-amber-700">Discover exclusive deals and special promotions beyond cashback.</CardDescription>
               </CardHeader>
               <CardContent>
                   <p className="text-amber-800/90 mb-4 text-sm">
                       Check out our curated list of hot deals, bank offers, and limited-time promotions updated daily.
                   </p>
                   <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                       <Link href="/deals">Explore Hot Deals</Link>
                   </Button>
               </CardContent>
           </Card>
            <Card className="shadow-sm bg-gradient-to-tr from-green-50 to-emerald-100 border-green-300">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-800"><Gift className="text-green-600 w-6 h-6" /> Refer & Earn More!</CardTitle>
                    <CardDescription className="text-green-700">Invite friends and you both earn bonus cashback.</CardDescription>
                </CardHeader>
                <CardContent>
                     <p className="text-green-800/90 mb-4 text-sm">
                       Share your unique referral link. When your friend signs up and makes their first qualifying purchase, you both get rewarded!
                   </p>
                   <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                       <Link href="/dashboard/referrals">Get Your Referral Link</Link>
                   </Button>
                </CardContent>
            </Card>
       </section>
    </div>
  );
}
