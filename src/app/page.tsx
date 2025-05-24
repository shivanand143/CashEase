
"use client";

import * as React from 'react';
import {
  collection, query, where, orderBy, limit, getDocs, doc, getDoc, Timestamp, QueryConstraint
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Store, Coupon, Banner, Category, Product } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import StoreCard from '@/components/store-card';
import CouponCard from '@/components/coupon-card';
import ProductCard from '@/components/product-card';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Added CardTitle
import { Input } from '@/components/ui/input';
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowRight, ShoppingBag, List, Search as SearchIcon, AlertCircle, Sparkles, Tag, Percent
} from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useHasMounted } from '@/hooks/use-has-mounted';

const ITEMS_PER_SECTION_STORES_CATEGORIES = 6;
const ITEMS_PER_SECTION_PRODUCTS_COUPONS = 3; // For Today's Picks and Top Coupons

async function fetchItemsWithStoreData<
  CollectionName extends 'products' | 'coupons',
  ItemType extends Product | Coupon
>(
  collectionName: CollectionName,
  constraints: QueryConstraint[],
  itemLimit: number,
  enrichWithStore: boolean = true
): Promise<(ItemType & { store?: Store })[]> {
  if (firebaseInitializationError || !db) {
    console.error(`HOMEPAGE_FETCH_ERROR: Firestore not initialized for fetching ${collectionName}. Error: ${firebaseInitializationError}`);
    // Return an empty array or throw an error to be caught by the caller
    return []; // Or throw new Error("Firestore not initialized.");
  }

  let itemsData: ItemType[] = [];
  try {
    const q = query(collection(db, collectionName), ...constraints, limit(itemLimit));
    const snapshot = await getDocs(q);

    itemsData = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      const baseItem: any = {
        id: docSnap.id,
        ...data,
        createdAt: safeToDate(data.createdAt as Timestamp | undefined),
        updatedAt: safeToDate(data.updatedAt as Timestamp | undefined),
      };
      if (collectionName === 'coupons') {
        baseItem.expiryDate = safeToDate(data.expiryDate as Timestamp | undefined);
      }
      return baseItem as ItemType;
    });

    if (!enrichWithStore || itemsData.length === 0) {
      return itemsData;
    }

    const storeIds = [...new Set(itemsData.map(item => (item as any).storeId).filter(Boolean))];
    const storeCache = new Map<string, Store>();

    if (storeIds.length > 0) {
      const storeChunks: string[][] = [];
      for (let i = 0; i < storeIds.length; i += 30) { // Firestore 'in' query supports up to 30 elements
        storeChunks.push(storeIds.slice(i, i + 30));
      }
      for (const chunk of storeChunks) {
        if (chunk.length === 0) continue;
        const storeQuery = query(collection(db, 'stores'), where('__name__', 'in', chunk));
        const storeSnap = await getDocs(storeQuery);
        storeSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          storeCache.set(docSnap.id, {
            id: docSnap.id,
            ...data,
            createdAt: safeToDate(data.createdAt as Timestamp | undefined),
            updatedAt: safeToDate(data.updatedAt as Timestamp | undefined),
          } as Store);
        });
      }
    }

    return itemsData.map(item => ({
      ...item,
      store: storeCache.get((item as any).storeId),
    }));

  } catch (error) {
      console.error(`HOMEPAGE_FETCH_ERROR: Error fetching ${collectionName}:`, error);
      // Propagate the error or return empty array, depending on desired behavior
      throw error; // Or return [];
  }
}

function HomePageSkeleton() {
  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      <Skeleton className="h-[250px] sm:h-[300px] md:h-[400px] w-full rounded-lg" />
      <Card className="max-w-2xl mx-auto shadow-md border-2 border-primary/50 p-1 bg-gradient-to-r from-primary/5 via-background to-secondary/5 rounded-xl">
        <CardHeader className="pb-3 pt-4 text-center">
          <Skeleton className="h-7 w-3/4 mx-auto mb-1" />
          {/* <Skeleton className="h-5 w-1/2 mx-auto" /> // CardDescription removed */}
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="flex gap-2 items-center">
            <Skeleton className="h-5 w-5 ml-2 text-muted-foreground hidden sm:block" /> {/* Search Icon Placeholder */}
            <Skeleton className="h-11 flex-grow rounded-md" />
            <Skeleton className="h-11 w-24 rounded-md" />
          </div>
        </CardContent>
      </Card>
      {/* Today's Picks Products Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tp-skel-${i}`} className="h-72 rounded-lg" />)}
        </div>
      </section>
      {/* Featured Stores Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => <Skeleton key={`fs-skel-${i}`} className="h-40 rounded-lg" />)}
        </div>
      </section>
      {/* Top Coupons Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tc-skel-${i}`} className="h-44 rounded-lg" />)}
        </div>
      </section>
      {/* Popular Categories Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => (
            <div key={`pc-skel-${i}`} className="flex flex-col items-center p-2 border rounded-lg bg-card shadow-sm">
              <Skeleton className="w-16 h-16 rounded-full mb-2" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const hasMounted = useHasMounted();

  const [banners, setBanners] = React.useState<Banner[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [featuredStores, setFeaturedStores] = React.useState<Store[]>([]);
  const [topCoupons, setTopCoupons] = React.useState<(Coupon & { store?: Store })[]>([]);
  const [todaysPicksProducts, setTodaysPicksProducts] = React.useState<(Product & { store?: Store })[]>([]);

  const [loadingBanners, setLoadingBanners] = React.useState(true);
  const [loadingCategories, setLoadingCategories] = React.useState(true);
  const [loadingFeaturedStores, setLoadingFeaturedStores] = React.useState(true);
  const [loadingTopCoupons, setLoadingTopCoupons] = React.useState(true);
  const [loadingTodaysPicks, setLoadingTodaysPicks] = React.useState(true);
  const [pageInitialLoading, setPageInitialLoading] = React.useState(true);

  const [pageErrors, setPageErrors] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');

  React.useEffect(() => {
    let isMounted = true;
    console.log("HOMEPAGE: useEffect triggered. isMounted:", isMounted, "hasMounted (hook):", hasMounted);

    const loadAllData = async () => {
      if (!isMounted) {
        console.log("HOMEPAGE: loadAllData called but component unmounted.");
        return;
      }
      console.log("HOMEPAGE: loadAllData called.");
      setPageInitialLoading(true);
      setPageErrors([]); // Clear previous errors

      if (firebaseInitializationError) {
        if (isMounted) {
          const errorMsg = `Firebase init failed: ${firebaseInitializationError}`;
          setPageErrors(prev => [...new Set([...prev, errorMsg])]); // Avoid duplicate errors
          console.error("HOMEPAGE_ERROR:", errorMsg);
          setLoadingBanners(false); setLoadingCategories(false); setLoadingFeaturedStores(false);
          setLoadingTopCoupons(false); setLoadingTodaysPicks(false); setPageInitialLoading(false);
        }
        return;
      }
      if (!db) {
        if (isMounted) {
          const errorMsg = "DB not available.";
          setPageErrors(prev => [...new Set([...prev, errorMsg])]);
          console.error("HOMEPAGE_ERROR:", errorMsg);
          setLoadingBanners(false); setLoadingCategories(false); setLoadingFeaturedStores(false);
          setLoadingTopCoupons(false); setLoadingTodaysPicks(false); setPageInitialLoading(false);
        }
        return;
      }

      const errorsAccumulator: string[] = [];
      const sectionFetchPromises = [];

      // Fetch Banners
      setLoadingBanners(true);
      console.log("HOMEPAGE: Initiating Banners fetch.");
      sectionFetchPromises.push(
        (async () => {
          try {
            const bannersQuery = query(collection(db, 'banners'), where('isActive', '==', true), orderBy('order', 'asc'));
            const bannerSnap = await getDocs(bannersQuery);
            if (isMounted) setBanners(bannerSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(doc.data().updatedAt as Timestamp | undefined) } as Banner)));
            console.log(`HOMEPAGE: Banners fetch complete. Count: ${bannerSnap.size}`);
          } catch (err) { console.error("Error fetching banners:", err); errorsAccumulator.push("banners"); }
          finally { if (isMounted) setLoadingBanners(false); }
        })()
      );

      // Fetch Categories
      setLoadingCategories(true);
      console.log("HOMEPAGE: Initiating Categories fetch.");
      sectionFetchPromises.push(
        (async () => {
          try {
            const categoriesQuery = query(collection(db, 'categories'), where('isActive', '==', true), orderBy('order', 'asc'), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
            const categorySnap = await getDocs(categoriesQuery);
            if (isMounted) setCategories(categorySnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(doc.data().updatedAt as Timestamp | undefined) } as Category)));
            console.log(`HOMEPAGE: Categories fetch complete. Count: ${categorySnap.size}`);
          } catch (err) { console.error("Error fetching categories:", err); errorsAccumulator.push("categories"); }
          finally { if (isMounted) setLoadingCategories(false); }
        })()
      );

      // Fetch Featured Stores
      setLoadingFeaturedStores(true);
      console.log("HOMEPAGE: Initiating Featured Stores fetch.");
      sectionFetchPromises.push(
        (async () => {
          try {
            const storesQuery = query(collection(db, 'stores'), where('isActive', '==', true), where('isFeatured', '==', true), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
            const storeSnap = await getDocs(storesQuery);
            if (isMounted) setFeaturedStores(storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(doc.data().updatedAt as Timestamp | undefined) } as Store)));
            console.log(`HOMEPAGE: Featured Stores fetch complete. Count: ${storeSnap.size}`);
          } catch (err) { console.error("Error fetching featured stores:", err); errorsAccumulator.push("stores"); }
          finally { if (isMounted) setLoadingFeaturedStores(false); }
        })()
      );

      // Fetch Top Coupons
      setLoadingTopCoupons(true);
      console.log("HOMEPAGE: Initiating Top Coupons fetch.");
      sectionFetchPromises.push(
        (async () => {
          try {
            const couponConstraints: QueryConstraint[] = [
              where('isActive', '==', true), where('isFeatured', '==', true), orderBy('createdAt', 'desc'),
            ];
            const fetchedCoupons = await fetchItemsWithStoreData<'coupons', Coupon>('coupons', couponConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS, true);
            if (isMounted) setTopCoupons(fetchedCoupons);
            console.log(`HOMEPAGE: Top Coupons fetch complete. Count: ${fetchedCoupons.length}`);
          } catch (err) { console.error("Error fetching top coupons:", err); errorsAccumulator.push("coupons"); }
          finally { if (isMounted) setLoadingTopCoupons(false); }
        })()
      );

      // Fetch Today's Picks Products
      setLoadingTodaysPicks(true);
      console.log("HOMEPAGE: Initiating Today's Picks Products fetch.");
      sectionFetchPromises.push(
        (async () => {
          try {
            const productConstraints: QueryConstraint[] = [
              where('isActive', '==', true), where('isTodaysPick', '==', true), orderBy('updatedAt', 'desc')
            ];
            const fetchedProducts = await fetchItemsWithStoreData<'products', Product>('products', productConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS, true);
            if (isMounted) setTodaysPicksProducts(fetchedProducts);
            console.log(`HOMEPAGE: Today's Picks Products fetch complete. Count: ${fetchedProducts.length}`);
          } catch (err) { console.error("Error fetching today's picks products:", err); errorsAccumulator.push("today's picks products"); }
          finally { if (isMounted) setLoadingTodaysPicks(false); }
        })()
      );

      await Promise.allSettled(sectionFetchPromises);

      if (isMounted) {
        if (errorsAccumulator.length > 0) {
          const errorMessage = `Failed to load some data sections: ${errorsAccumulator.join(', ')}. Some content may be missing. Please try refreshing the page. If the problem persists, contact support.`;
          setPageErrors(prev => [...new Set([...prev, errorMessage])]); // Use Set to avoid duplicate combined messages
          toast({ variant: "destructive", title: "Data Loading Issues", description: errorMessage, duration: 10000 });
        }
        setPageInitialLoading(false);
        console.log("HOMEPAGE: loadAllData finished. Page initial loading set to false.");
      }
    };

    if (hasMounted) {
      loadAllData();
    }

    return () => {
      isMounted = false;
      console.log("HOMEPAGE: Component unmounted or useEffect re-running.");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMounted, toast]); // fetchItemsWithStoreData is stable if defined outside or memoized

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm(''); // Clear search term after submit
  };

  if (!hasMounted) {
    // Render nothing on the server and on the initial client render to match Suspense fallback in layout
    return null;
  }

  if (pageInitialLoading) {
    return <HomePageSkeleton />;
  }

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Banners Carousel */}
      <section className="relative -mx-4 sm:-mx-6 md:-mx-0">
        {loadingBanners && banners.length === 0 && !pageErrors.some(e => e.includes("banners")) ? (
          <Skeleton className="h-[250px] sm:h-[300px] md:h-[400px] w-full rounded-lg" />
        ) : banners.length > 0 ? (
          <Carousel
            plugins={[Autoplay({ delay: 5000, stopOnInteraction: true })]}
            className="w-full rounded-lg overflow-hidden shadow-lg border"
            opts={{ loop: banners.length > 1 }}
          >
            <CarouselContent>
              {banners.map((banner, index) => (
                <CarouselItem key={banner.id || index}>
                  <Link href={banner.link || '#'} className="block relative aspect-[16/7] md:aspect-[16/6] lg:aspect-[16/5] w-full">
                    <Image
                      src={banner.imageUrl || 'https://placehold.co/1200x400.png'}
                      alt={banner.altText || banner.title || 'Promotional Banner'}
                      fill
                      className="object-cover"
                      priority={index === 0}
                      data-ai-hint={banner.dataAiHint || "promotion offer"}
                    />
                    {(banner.title || banner.subtitle) && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col justify-end p-4 md:p-8">
                        {banner.title && <h2 className="text-xl md:text-3xl lg:text-4xl font-bold text-white drop-shadow-md mb-1">{banner.title}</h2>}
                        {banner.subtitle && <p className="text-sm md:text-lg text-gray-200 drop-shadow-sm">{banner.subtitle}</p>}
                      </div>
                    )}
                  </Link>
                </CarouselItem>
              ))}
            </CarouselContent>
            {banners.length > 1 && (
              <>
                <CarouselPrevious className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-background/70 hover:bg-background text-foreground" />
                <CarouselNext className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2  bg-background/70 hover:bg-background text-foreground" />
              </>
            )}
          </Carousel>
        ) : !loadingBanners && banners.length === 0 && !pageErrors.some(e => e.includes("banners")) ? (
          <div className="text-center py-10 text-muted-foreground bg-muted/30 rounded-lg border">No promotional banners available.</div>
        ): null}
        {pageErrors.some(e => e.includes("banners")) && (
            <Alert variant="destructive" className="mt-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Banners Unavailable</AlertTitle><AlertDescription>Promotional banners could not be loaded.</AlertDescription></Alert>
        )}
      </section>

      {/* Search Bar Section */}
      <section className="py-6 md:py-8">
        <Card className="max-w-2xl mx-auto shadow-md border-2 border-primary/50 p-1 bg-gradient-to-r from-primary/5 via-background to-secondary/5 rounded-xl">
          <CardHeader className="pb-3 pt-4 text-center">
            <CardTitle className="text-xl sm:text-2xl font-semibold">Find the Best Deals & Cashback</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center">
              <SearchIcon className="ml-2 h-5 w-5 text-muted-foreground hidden sm:block" />
              <Input
                type="search"
                name="search" // Add name attribute
                placeholder="Search for stores, brands or products..."
                className="flex-grow h-11 text-base rounded-md shadow-inner"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button type="submit" size="lg" className="h-11 text-base rounded-md">Search</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Today's Picks (Products) */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" /> Today's Picks
          </h2>
          {/* Optional: Link to a page showing all today's picks if you implement such a page */}
        </div>
        {loadingTodaysPicks && todaysPicksProducts.length === 0 && !pageErrors.some(e => e.includes("today's picks products")) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tp-skel-render-${i}`} className="h-72 rounded-lg" />)}
          </div>
        ) : todaysPicksProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {todaysPicksProducts.map(product => (
              <ProductCard key={product.id} product={product} storeContext={product.store} />
            ))}
          </div>
        ) : !loadingTodaysPicks && todaysPicksProducts.length === 0 && !pageErrors.some(e => e.includes("today's picks products"))? (
          <div className="text-center py-6 text-muted-foreground text-sm">No special product picks for today. Check back soon!</div>
        ) : null}
         {pageErrors.some(e => e.includes("today's picks products")) && (
            <Alert variant="destructive" className="mt-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Today's Picks Unavailable</AlertTitle><AlertDescription>Could not load today's picks products.</AlertDescription></Alert>
        )}
      </section>


      {/* Featured Stores */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-primary" /> Featured Stores</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/stores" className="flex items-center gap-1">View All <ArrowRight className="w-4 h-4" /></Link>
          </Button>
        </div>
        {loadingFeaturedStores && featuredStores.length === 0 && !pageErrors.some(e => e.includes("stores"))? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => <Skeleton key={`fs-skel-render-${i}`} className="h-40 rounded-lg" />)}
          </div>
        ) : featuredStores.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {featuredStores.map(store => <StoreCard key={store.id} store={store} />)}
          </div>
        ) : !loadingFeaturedStores && featuredStores.length === 0 && !pageErrors.some(e => e.includes("stores"))? (
          <div className="text-center py-6 text-muted-foreground text-sm">No featured stores available right now.</div>
        ): null}
        {pageErrors.some(e => e.includes("stores")) && (
             <Alert variant="destructive" className="mt-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Stores Unavailable</AlertTitle><AlertDescription>Could not load featured stores.</AlertDescription></Alert>
        )}
      </section>


      {/* Top Coupons & Offers */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2"><Tag className="w-6 h-6 text-destructive" /> Top Coupons & Offers</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/coupons" className="flex items-center gap-1">View All <ArrowRight className="w-4 h-4" /></Link>
          </Button>
        </div>
        {loadingTopCoupons && topCoupons.length === 0 && !pageErrors.some(e => e.includes("coupons")) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tc-skel-render-${i}`} className="h-44 rounded-lg" />)}
          </div>
        ) : topCoupons.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {topCoupons.map(coupon => <CouponCard key={coupon.id} coupon={coupon} />)}
          </div>
        ) : !loadingTopCoupons && topCoupons.length === 0 && !pageErrors.some(e => e.includes("coupons")) ? (
          <div className="text-center py-6 text-muted-foreground text-sm">No top coupons featured at the moment.</div>
        ) : null}
        {pageErrors.some(e => e.includes("coupons")) && (
             <Alert variant="destructive" className="mt-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Coupons Unavailable</AlertTitle><AlertDescription>Could not load top coupons.</AlertDescription></Alert>
        )}
      </section>

      {/* Popular Categories */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2"><List className="w-6 h-6 text-secondary" /> Popular Categories</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/categories" className="flex items-center gap-1">View All <ArrowRight className="w-4 h-4" /></Link>
          </Button>
        </div>
        {loadingCategories && categories.length === 0 && !pageErrors.some(e => e.includes("categories")) ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => (
              <div key={`pc-skel-render-${i}`} className="flex flex-col items-center p-2 border rounded-lg bg-card shadow-sm">
                <Skeleton className="w-16 h-16 rounded-full mb-2" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ): !loadingCategories && categories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {categories.map(category => (
              <Link key={category.id} href={`/category/${category.slug}`} className="block group">
                <Card className="flex flex-col items-center text-center p-3 hover:shadow-lg transition-shadow duration-200 h-full bg-card hover:bg-muted/50">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2 overflow-hidden border group-hover:border-primary transition-colors">
                    {category.imageUrl ? (
                      <Image src={category.imageUrl} alt={category.name} width={64} height={64} className="object-contain p-1" data-ai-hint={category.dataAiHint || "category icon"} onError={(e) => ((e.target as HTMLImageElement).src = 'https://placehold.co/64x64.png')} />
                    ) : (
                      <List className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm font-medium group-hover:text-primary transition-colors">{category.name}</p>
                </Card>
              </Link>
            ))}
          </div>
        ): (!loadingCategories && categories.length === 0 && !pageErrors.some(e => e.includes("categories"))) ? (
          <div className="text-center py-6 text-muted-foreground text-sm">No categories available right now.</div>
        ) : null}
        {pageErrors.some(e => e.includes("categories")) && (
            <Alert variant="destructive" className="mt-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Categories Unavailable</AlertTitle><AlertDescription>Could not load popular categories.</AlertDescription></Alert>
        )}
      </section>

      {pageErrors.length > 0 && !pageInitialLoading && ( // Show general error if any section failed and page is done with initial load attempt
         <Alert variant="destructive" className="mt-12">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Content Loading Issue</AlertTitle>
            <AlertDescription>
                Some sections on the page failed to load: {pageErrors.join("; ")}. Please check your internet connection or try refreshing.
            </AlertDescription>
         </Alert>
      )}
    </div>
  );
}
