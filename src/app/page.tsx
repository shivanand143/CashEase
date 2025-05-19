"use client";

import * as React from 'react';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, Timestamp, QueryConstraint } from 'firebase/firestore';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, ExternalLink, ShoppingBag, List, Search as SearchIcon, AlertCircle, Sparkles, Percent, Tag } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

const ITEMS_PER_SECTION_STORES_CATEGORIES = 6;
const ITEMS_PER_SECTION_PRODUCTS_COUPONS = 3;

// Helper function to fetch items and optionally enrich with store data
async function fetchItemsWithStoreData<
  CollectionName extends 'products' | 'coupons',
  ItemType extends Product | Coupon
>(
  collectionName: CollectionName,
  constraints: QueryConstraint[],
  itemLimit: number,
  enrichWithStore: boolean = false
): Promise<(ItemType & { store?: Store })[]> {
  if (!db) {
    console.error(`Firestore not initialized for fetching ${collectionName}.`);
    throw new Error("Firestore not initialized.");
  }
  console.log(`Fetching ${collectionName} with limit ${itemLimit} and constraints:`, constraints.map(c => c.type));

  const q = query(collection(db, collectionName), ...constraints, limit(itemLimit));
  const snapshot = await getDocs(q);
  console.log(`Fetched ${snapshot.size} documents for ${collectionName}.`);

  const itemsData = snapshot.docs.map(docSnap => {
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
    console.log(`Enriching ${collectionName}: Found ${storeIds.length} unique storeIDs to fetch.`);
    const storeChunks: string[][] = [];
    for (let i = 0; i < storeIds.length; i += 30) { // Firestore 'in' query limit is 30
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
    console.log(`Enriching ${collectionName}: Fetched ${storeCache.size} stores for cache.`);
  }

  return itemsData.map(item => ({
    ...item,
    store: storeCache.get((item as any).storeId),
  }));
}

function HomePageSkeleton() {
  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Banner Skeleton */}
      <Skeleton className="h-[250px] sm:h-[300px] md:h-[400px] w-full rounded-lg" />
      {/* Search Skeleton */}
      <Card className="max-w-2xl mx-auto shadow-md border-2 border-primary/50 p-1 rounded-xl">
        <CardHeader className="pb-3 pt-4 text-center">
          <Skeleton className="h-7 w-3/4 mx-auto mb-1" />
          <Skeleton className="h-5 w-1/2 mx-auto" />
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="flex gap-2 items-center">
            <Skeleton className="h-5 w-5 rounded-full hidden sm:block" />
            <Skeleton className="h-11 flex-grow rounded-md" />
            <Skeleton className="h-11 w-24 rounded-md" />
          </div>
        </CardContent>
      </Card>
      {/* Today's Picks Skeleton */}
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

  const [pageErrors, setPageErrors] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');

  React.useEffect(() => {
    let isMounted = true;
    const loadAllData = async () => {
      console.log("HomePage: Starting to load all data sections...");
      if (firebaseInitializationError) {
        if (isMounted) setPageErrors(prev => [...prev, `Firebase initialization failed: ${firebaseInitializationError}`]);
        if (isMounted) { setLoadingBanners(false); setLoadingCategories(false); setLoadingFeaturedStores(false); setLoadingTopCoupons(false); setLoadingTodaysPicks(false); }
        return;
      }
      if (!db) {
        if (isMounted) setPageErrors(prev => [...prev, "Database connection not available."]);
        if (isMounted) { setLoadingBanners(false); setLoadingCategories(false); setLoadingFeaturedStores(false); setLoadingTopCoupons(false); setLoadingTodaysPicks(false); }
        return;
      }

      const errors: string[] = [];

      // Fetch Banners
      setLoadingBanners(true);
      try {
        console.log("HomePage: Fetching banners...");
        const bannersQuery = query(collection(db, 'banners'), where('isActive', '==', true), orderBy('order', 'asc'));
        const bannerSnap = await getDocs(bannersQuery);
        if (isMounted) setBanners(bannerSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(doc.data().updatedAt as Timestamp | undefined) } as Banner)));
        console.log(`HomePage: Fetched ${bannerSnap.size} banners.`);
      } catch (err) { console.error("Error fetching banners:", err); errors.push("banners"); }
      finally { if (isMounted) setLoadingBanners(false); }

      // Fetch Categories
      setLoadingCategories(true);
      try {
        console.log("HomePage: Fetching categories...");
        const categoriesQuery = query(collection(db, 'categories'), where('isActive', '==', true), orderBy('order', 'asc'), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
        const categorySnap = await getDocs(categoriesQuery);
        if (isMounted) setCategories(categorySnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(doc.data().updatedAt as Timestamp | undefined) } as Category)));
        console.log(`HomePage: Fetched ${categorySnap.size} categories.`);
      } catch (err) { console.error("Error fetching categories:", err); errors.push("categories"); }
      finally { if (isMounted) setLoadingCategories(false); }

      // Fetch Featured Stores
      setLoadingFeaturedStores(true);
      try {
        console.log("HomePage: Fetching featured stores...");
        const storesQuery = query(collection(db, 'stores'), where('isActive', '==', true), where('isFeatured', '==', true), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
        const storeSnap = await getDocs(storesQuery);
        if (isMounted) setFeaturedStores(storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(doc.data().updatedAt as Timestamp | undefined) } as Store)));
        console.log(`HomePage: Fetched ${storeSnap.size} featured stores.`);
      } catch (err) { console.error("Error fetching featured stores:", err); errors.push("stores"); }
      finally { if (isMounted) setLoadingFeaturedStores(false); }

      // Fetch Top Coupons
      setLoadingTopCoupons(true);
      try {
        console.log("HomePage: Fetching top coupons...");
        const couponConstraints: QueryConstraint[] = [
          where('isActive', '==', true), where('isFeatured', '==', true), orderBy('createdAt', 'desc'),
        ];
        const fetchedCoupons = await fetchItemsWithStoreData<'coupons', Coupon>('coupons', couponConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS, true);
        if (isMounted) setTopCoupons(fetchedCoupons);
        console.log(`HomePage: Fetched ${fetchedCoupons.length} top coupons.`);
      } catch (err) { console.error("Error fetching top coupons:", err); errors.push("coupons"); }
      finally { if (isMounted) setLoadingTopCoupons(false); }

      // Fetch Today's Picks Products
      setLoadingTodaysPicks(true);
      try {
        console.log("HomePage: Fetching today's picks products...");
        const productConstraints: QueryConstraint[] = [
          where('isActive', '==', true), where('isTodaysPick', '==', true), orderBy('updatedAt', 'desc')
        ];
        const fetchedProducts = await fetchItemsWithStoreData<'products', Product>('products', productConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS, true);
        if (isMounted) setTodaysPicksProducts(fetchedProducts);
        console.log(`HomePage: Fetched ${fetchedProducts.length} today's picks products.`);
      } catch (err) { console.error("Error fetching today's picks products:", err); errors.push("today's picks products"); }
      finally { if (isMounted) setLoadingTodaysPicks(false); }


      if (errors.length > 0 && isMounted) {
        const errorMessage = `Failed to load some data sections: ${errors.join(', ')}. Some content may be missing. Please try refreshing the page. If the problem persists, contact support.`;
        setPageErrors(prev => [...prev, errorMessage]); // Add to existing errors
        toast({
          variant: "destructive",
          title: "Data Loading Issues",
          description: errorMessage,
          duration: 10000,
        });
        console.error("HomePage: Data loading errors occurred:", errors);
      } else if (isMounted) {
        console.log("HomePage: All data sections attempted to load.");
      }
    };

    loadAllData();
    return () => { isMounted = false; console.log("HomePage: Component unmounted or effect re-running."); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // fetchItemsWithStoreData removed to prevent loop if it wasn't stable

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm('');
  };

  const allSectionsLoading = loadingBanners && loadingCategories && loadingFeaturedStores && loadingTopCoupons && loadingTodaysPicks;

  if (allSectionsLoading && pageErrors.length === 0) {
    return <HomePageSkeleton />;
  }

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Banners Carousel */}
      <section className="relative -mx-4 sm:-mx-6 md:-mx-0">
        {loadingBanners ? (
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
                      data-ai-hint={banner.dataAiHint || "promotion offer sale"}
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
        ) : (!loadingBanners && pageErrors.some(e => e.includes("banners"))) ? (
            <Alert variant="destructive" className="my-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Banners Unavailable</AlertTitle><AlertDescription>Promotional banners could not be loaded at this time.</AlertDescription></Alert>
        ) : (
          !loadingBanners && <div className="text-center py-10 text-muted-foreground bg-muted/30 rounded-lg">No promotional banners available.</div>
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
                name="search"
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
          <h2 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-amber-500" /> Today's Picks</h2>
        </div>
        {loadingTodaysPicks && !todaysPicksProducts.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tp-skel-render-${i}`} className="h-72 rounded-lg" />)}
          </div>
        ) : todaysPicksProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {todaysPicksProducts.map(product => (
              <ProductCard key={product.id} product={product} storeContext={product.store} />
            ))}
          </div>
        ) : (!loadingTodaysPicks && pageErrors.some(e => e.includes("today's picks products"))) ? (
            <Alert variant="destructive" className="my-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Today's Picks Unavailable</AlertTitle><AlertDescription>Could not load today's picks.</AlertDescription></Alert>
        ) : (
          !loadingTodaysPicks && <div className="text-center py-6 text-muted-foreground text-sm">No special product picks for today. Check back soon!</div>
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
        {loadingFeaturedStores && !featuredStores.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => <Skeleton key={`fs-skel-render-${i}`} className="h-40 rounded-lg" />)}
          </div>
        ) : featuredStores.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {featuredStores.map(store => <StoreCard key={store.id} store={store} />)}
          </div>
        ) : (!loadingFeaturedStores && pageErrors.some(e => e.includes("stores"))) ? (
             <Alert variant="destructive" className="my-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Stores Unavailable</AlertTitle><AlertDescription>Could not load featured stores.</AlertDescription></Alert>
        ) : (
          !loadingFeaturedStores && <div className="text-center py-6 text-muted-foreground text-sm">No featured stores available right now.</div>
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
        {loadingTopCoupons && !topCoupons.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tc-skel-render-${i}`} className="h-44 rounded-lg" />)}
          </div>
        ) : topCoupons.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {topCoupons.map(coupon => <CouponCard key={coupon.id} coupon={coupon} />)}
          </div>
        ) : (!loadingTopCoupons && pageErrors.some(e => e.includes("coupons"))) ? (
             <Alert variant="destructive" className="my-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Coupons Unavailable</AlertTitle><AlertDescription>Could not load top coupons.</AlertDescription></Alert>
        ) : (
          !loadingTopCoupons && <div className="text-center py-6 text-muted-foreground text-sm">No top coupons featured at the moment.</div>
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
        {loadingCategories && !categories.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => (
              <div key={`pc-skel-render-${i}`} className="flex flex-col items-center p-2 border rounded-lg bg-card shadow-sm">
                <Skeleton className="w-16 h-16 rounded-full mb-2" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : categories.length > 0 ? (
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
        ) : (!loadingCategories && pageErrors.some(e => e.includes("categories"))) ? (
            <Alert variant="destructive" className="my-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Categories Unavailable</AlertTitle><AlertDescription>Could not load popular categories.</AlertDescription></Alert>
        ) : (
          !loadingCategories && <div className="text-center py-6 text-muted-foreground text-sm">No categories available right now.</div>
        )}
      </section>

      {pageErrors.length > 0 && !allSectionsLoading && (
        <Alert variant="destructive" className="mt-12">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Content Loading Issue</AlertTitle>
          <AlertDescription>
            {pageErrors.join(" ")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
