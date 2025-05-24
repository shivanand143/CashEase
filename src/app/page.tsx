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
import { ArrowRight, ExternalLinkIcon, Tag, ShoppingBag, List, Search, AlertCircle, Sparkles, Percent, IndianRupee } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

const ITEMS_PER_SECTION_STORES_CATEGORIES = 6;
const ITEMS_PER_SECTION_PRODUCTS_COUPONS = 4; // Adjusted for potentially smaller product cards

async function fetchItemsWithStoreData<T extends Product | Coupon>(
  itemType: 'products' | 'coupons',
  constraints: QueryConstraint[],
  itemLimit: number
): Promise<(T & { store?: Store })[]> {
  if (!db || firebaseInitializationError) {
    console.error(`HOMEPAGE_FETCH_HELPER: Firestore not initialized for fetchItemsWithStoreData (${itemType})`);
    throw new Error("Firestore not initialized");
  }

  const q = query(collection(db, itemType), ...constraints, limit(itemLimit));
  const snapshot = await getDocs(q);

  const itemsDataPromises = snapshot.docs.map(async (docSnap) => {
    const data = docSnap.data();
    const itemBase = {
      id: docSnap.id,
      ...data,
      createdAt: safeToDate(data.createdAt as Timestamp | undefined),
      updatedAt: safeToDate(data.updatedAt as Timestamp | undefined),
    } as T;

    if (itemType === 'coupons') {
      (itemBase as Coupon).expiryDate = safeToDate(data.expiryDate as Timestamp | undefined);
    }

    let storeData: Store | undefined = undefined;
    const storeId = (data as any).storeId;

    if (storeId) {
      try {
        const storeDocRef = doc(db, 'stores', storeId);
        const storeDocSnap = await getDoc(storeDocRef);
        if (storeDocSnap.exists()) {
          const rawStoreData = storeDocSnap.data();
          storeData = {
            id: storeDocSnap.id,
            ...rawStoreData,
            createdAt: safeToDate(rawStoreData.createdAt as Timestamp | undefined),
            updatedAt: safeToDate(rawStoreData.updatedAt as Timestamp | undefined),
          } as Store;
        }
      } catch (storeFetchError) {
        console.error(`HOMEPAGE_FETCH_HELPER: Failed to fetch store ${storeId} for item ${docSnap.id} (${itemType}):`, storeFetchError);
      }
    }
    return { ...itemBase, store: storeData };
  });

  return Promise.all(itemsDataPromises);
}

function HomePageSkeleton() {
  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Banner Skeleton */}
      <Skeleton className="h-[250px] sm:h-[300px] md:h-[400px] w-full rounded-lg" />

      {/* Search Bar Skeleton */}
      <Card className="max-w-2xl mx-auto shadow-md border-2 border-primary/50 p-1 rounded-xl">
        <CardHeader className="pb-3 pt-4 text-center"><Skeleton className="h-7 w-3/4 mx-auto mb-1" /></CardHeader>
        <CardContent className="p-3 sm:p-4"><div className="flex gap-2 items-center"><Skeleton className="h-11 flex-grow rounded-md" /><Skeleton className="h-11 w-24 rounded-md" /></div></CardContent>
      </Card>

      {/* Section Skeleton (repeated for Today's Picks, Featured Stores, Top Coupons, Popular Categories) */}
      {[...Array(4)].map((_, sectionIndex) => (
        <section key={`section-skel-${sectionIndex}`}>
          <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
          <div className={`grid grid-cols-2 ${sectionIndex % 2 === 0 ? 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'} gap-3 md:gap-4`}>
            {Array.from({ length: sectionIndex % 2 === 0 ? ITEMS_PER_SECTION_PRODUCTS_COUPONS : ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => <Skeleton key={`item-skel-${sectionIndex}-${i}`} className={`${sectionIndex % 2 === 0 ? 'h-56' : 'h-36'} rounded-lg`} />)}
          </div>
        </section>
      ))}
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
  
  const [pageInitialLoading, setPageInitialLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');

  React.useEffect(() => {
    let isMounted = true;

    const loadAllData = async () => {
      if (!isMounted) return;
      console.log("HOMEPAGE: Starting to load all data...");
      // Ensure pageInitialLoading is true at the start of this effect if re-fetching is possible,
      // or if it's the very first load. Since it's initialized to true, this is fine.
      // If you had a pull-to-refresh or manual refresh button, you'd set it true here.
      // setPageInitialLoading(true); 
      setPageError([]); // Clear previous errors on new load attempt

      const currentErrors: string[] = [];

      if (firebaseInitializationError) {
        currentErrors.push(`Firebase initialization failed: ${firebaseInitializationError}`);
      }
      if (!db && !firebaseInitializationError) {
        currentErrors.push("Database connection not available.");
      }

      if (currentErrors.length > 0) {
        if (isMounted) {
          setPageError(currentErrors);
          toast({ variant: "destructive", title: "Setup Error", description: currentErrors.join(" "), duration: 10000 });
          setPageInitialLoading(false); // Critical: Set loading false even if setup failed
        }
        return;
      }

      const sectionFetchPromises = [
        (async () => {
          console.log("HOMEPAGE: Fetching banners...");
          const bannersQuery = query(collection(db!, 'banners'), where('isActive', '==', true), orderBy('order', 'asc'));
          const bannerSnap = await getDocs(bannersQuery);
          if (isMounted) setBanners(bannerSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: safeToDate(d.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined) } as Banner)));
          console.log(`HOMEPAGE: Fetched ${bannerSnap.size} banners.`);
        })().catch(err => { if(isMounted) { console.error("HOMEPAGE_ERROR: banners", err); currentErrors.push("banners"); }}),

        (async () => {
          console.log("HOMEPAGE: Fetching categories...");
          const categoriesQuery = query(collection(db!, 'categories'), where('isActive', '==', true), orderBy('order', 'asc'), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
          const categorySnap = await getDocs(categoriesQuery);
          if (isMounted) setCategories(categorySnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: safeToDate(d.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined) } as Category)));
          console.log(`HOMEPAGE: Fetched ${categorySnap.size} categories.`);
        })().catch(err => { if(isMounted) { console.error("HOMEPAGE_ERROR: categories", err); currentErrors.push("categories"); }}),

        (async () => {
          console.log("HOMEPAGE: Fetching featured stores...");
          const storesQuery = query(collection(db!, 'stores'), where('isActive', '==', true), where('isFeatured', '==', true), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
          const storeSnap = await getDocs(storesQuery);
          if (isMounted) setFeaturedStores(storeSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: safeToDate(d.data().createdAt as Timestamp | undefined), updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined) } as Store)));
          console.log(`HOMEPAGE: Fetched ${storeSnap.size} featured stores.`);
        })().catch(err => { if(isMounted) { console.error("HOMEPAGE_ERROR: featured stores", err); currentErrors.push("featured stores"); }}),

        (async () => {
          console.log("HOMEPAGE: Fetching top coupons...");
          const couponConstraints: QueryConstraint[] = [
            where('isActive', '==', true),
            where('isFeatured', '==', true),
            orderBy('createdAt', 'desc'),
          ];
          const fetchedCoupons = await fetchItemsWithStoreData<'coupons', Coupon>('coupons', couponConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS);
          if (isMounted) setTopCoupons(fetchedCoupons);
          console.log(`HOMEPAGE: Fetched ${fetchedCoupons.length} top coupons.`);
        })().catch(err => { if(isMounted) { console.error("HOMEPAGE_ERROR: top coupons", err); currentErrors.push("top coupons"); }}),

        (async () => {
          console.log("HOMEPAGE: Fetching today's picks products...");
          const productConstraints: QueryConstraint[] = [
            where('isActive', '==', true),
            where('isTodaysPick', '==', true),
            orderBy('updatedAt', 'desc')
          ];
          const fetchedProducts = await fetchItemsWithStoreData<'products', Product>('products', productConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS);
          if (isMounted) setTodaysPicksProducts(fetchedProducts);
          console.log(`HOMEPAGE: Fetched ${fetchedProducts.length} today's picks products.`);
        })().catch(err => { if(isMounted) { console.error("HOMEPAGE_ERROR: today's picks products", err); currentErrors.push("today's picks products"); }})
      ];

      await Promise.allSettled(sectionFetchPromises)
        .finally(() => {
          if (isMounted) {
            if (currentErrors.length > 0) {
              const errorMessage = `Failed to load some data sections: ${currentErrors.join(', ')}. Some content may be missing.`;
              setPageError(prev => [...prev, ...currentErrors.filter(e => !prev.includes(e))]); // Add new errors without duplicating
              toast({
                variant: "destructive",
                title: "Error Loading Page Data",
                description: errorMessage,
                duration: 10000,
              });
            }
            setPageInitialLoading(false);
            console.log("HOMEPAGE: All data loading attempts finished. Final loading state: false.");
          }
        });
    };

    loadAllData();

    return () => {
      isMounted = false;
      console.log("HOMEPAGE: Component unmounted.");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // toast is stable and should not cause re-runs.

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm(''); // Clear search term after submission
  };

  if (pageInitialLoading) {
    return <HomePageSkeleton />;
  }

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Banners Carousel */}
      <section className="relative -mx-4 sm:-mx-6 md:-mx-0">
        {banners.length > 0 ? (
          <Carousel
            plugins={[Autoplay({ delay: 5000, stopOnInteraction: true })]}
            className="w-full rounded-lg overflow-hidden shadow-lg border"
            opts={{ loop: true }}
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
        ) : pageError.some(e => e.includes("banners")) ? null : (
          <div className="text-center py-10 text-muted-foreground bg-muted/30 rounded-lg">No promotional banners available.</div>
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
                      <Search className="ml-2 h-5 w-5 text-muted-foreground hidden sm:block" />
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
            <h2 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-500" /> Today's Picks
            </h2>
          </div>
          {todaysPicksProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                {todaysPicksProducts.map(product => (
                <ProductCard key={product.id} product={product} storeContext={product.store} />
                ))}
            </div>
          ) : pageError.some(e => e.includes("today's picks products")) ? null : (
            <div className="text-center py-6 text-muted-foreground text-sm">No special product picks for today. Check back soon!</div>
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
          {featuredStores.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                {featuredStores.map(store => <StoreCard key={store.id} store={store} />)}
            </div>
          ): pageError.some(e => e.includes("featured stores")) ? null : (
            <div className="text-center py-6 text-muted-foreground text-sm">No featured stores available right now.</div>
          )}
      </section>


      {/* Top Coupons & Offers */}
      <section>
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Percent className="w-6 h-6 text-destructive" /> Top Coupons & Offers</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/coupons" className="flex items-center gap-1">View All <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </div>
          {topCoupons.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {topCoupons.map(coupon => <CouponCard key={coupon.id} coupon={coupon} />)}
            </div>
          ) : pageError.some(e => e.includes("top coupons")) ? null : (
            <div className="text-center py-6 text-muted-foreground text-sm">No top coupons featured at the moment.</div>
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
          {categories.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                {categories.map(category => (
                <Link key={category.id} href={`/category/${category.slug}`} className="block group">
                    <Card className="flex flex-col items-center text-center p-3 hover:shadow-lg transition-shadow duration-200 h-full bg-card hover:bg-muted/50">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2 overflow-hidden border group-hover:border-primary transition-colors">
                        {category.imageUrl ? (
                        <Image src={category.imageUrl} alt={category.name} width={64} height={64} className="object-contain p-1" data-ai-hint={category.dataAiHint || "category icon"}/>
                        ) : (
                        <List className="w-8 h-8 text-muted-foreground" />
                        )}
                    </div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">{category.name}</p>
                    </Card>
                </Link>
                ))}
            </div>
          ) : pageError.some(e => e.includes("categories")) ? null : (
             <div className="text-center py-6 text-muted-foreground text-sm">No categories available right now.</div>
          )}
      </section>

      {pageError.length > 0 && (
         <Alert variant="destructive" className="mt-12">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Content Loading Issue</AlertTitle>
            <AlertDescription>
                Failed to load: {pageError.join(', ')}. Some content may be missing.
            </AlertDescription>
         </Alert>
      )}
    </div>
  );
}