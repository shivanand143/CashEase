
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
import { ArrowRight, ExternalLink, Tag, ShoppingBag, List, Search, AlertCircle, Sparkles, Percent } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

const ITEMS_PER_SECTION_STORES_CATEGORIES = 6;
const ITEMS_PER_SECTION_PRODUCTS_COUPONS = 3;

// Helper function to fetch items and optionally enrich with store data
async function fetchEnrichedItems<T extends Product | Coupon>(
  collectionName: 'products' | 'coupons',
  constraints: QueryConstraint[],
  itemLimit: number,
  enrichWithStore: boolean = false
): Promise<(T & { store?: Store })[]> {
  if (!db) throw new Error("Firestore not initialized for fetching items.");

  const q = query(collection(db, collectionName), ...constraints, limit(itemLimit));
  const snapshot = await getDocs(q);

  const itemsData = snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    const baseItem = {
      id: docSnap.id,
      ...data,
      createdAt: safeToDate(data.createdAt as Timestamp | undefined),
      updatedAt: safeToDate(data.updatedAt as Timestamp | undefined),
    };
    if (collectionName === 'coupons') {
      (baseItem as Coupon).expiryDate = safeToDate(data.expiryDate as Timestamp | undefined);
    }
    return baseItem as T;
  });

  if (!enrichWithStore || itemsData.length === 0) {
    return itemsData;
  }

  const storeIds = [...new Set(itemsData.map(item => (item as any).storeId).filter(Boolean))];
  const storeCache = new Map<string, Store>();

  if (storeIds.length > 0) {
    // Batch fetch store data
    const storeChunks: string[][] = [];
    for (let i = 0; i < storeIds.length; i += 10) { // Firestore 'in' query limit is 10 (or 30 for newer SDKs, 10 is safer)
      storeChunks.push(storeIds.slice(i, i + 10));
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
      if (!isMounted) return;

      if (firebaseInitializationError) {
        setPageErrors(prev => [...prev, `Firebase initialization failed: ${firebaseInitializationError}`]);
        setLoadingBanners(false); setLoadingCategories(false); setLoadingFeaturedStores(false);
        setLoadingTopCoupons(false); setLoadingTodaysPicks(false);
        return;
      }
      if (!db) {
        setPageErrors(prev => [...prev, "Database connection not available."]);
        setLoadingBanners(false); setLoadingCategories(false); setLoadingFeaturedStores(false);
        setLoadingTopCoupons(false); setLoadingTodaysPicks(false);
        return;
      }

      const errors: string[] = [];

      // Fetch Banners
      setLoadingBanners(true);
      try {
        const bannersQuery = query(collection(db, 'banners'), where('isActive', '==', true), orderBy('order', 'asc'));
        const bannerSnap = await getDocs(bannersQuery);
        if(isMounted) setBanners(bannerSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt), updatedAt: safeToDate(doc.data().updatedAt) } as Banner)));
      } catch (err) { console.error("Error fetching banners:", err); errors.push("banners"); }
      finally { if(isMounted) setLoadingBanners(false); }

      // Fetch Categories
      setLoadingCategories(true);
      try {
        const categoriesQuery = query(collection(db, 'categories'), where('isActive', '==', true), orderBy('order', 'asc'), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
        const categorySnap = await getDocs(categoriesQuery);
        if(isMounted) setCategories(categorySnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt), updatedAt: safeToDate(doc.data().updatedAt) } as Category)));
      } catch (err) { console.error("Error fetching categories:", err); errors.push("categories"); }
      finally { if(isMounted) setLoadingCategories(false); }

      // Fetch Featured Stores
      setLoadingFeaturedStores(true);
      try {
        const storesQuery = query(collection(db, 'stores'), where('isActive', '==', true), where('isFeatured', '==', true), orderBy('name', 'asc'), limit(ITEMS_PER_SECTION_STORES_CATEGORIES));
        const storeSnap = await getDocs(storesQuery);
        if(isMounted) setFeaturedStores(storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: safeToDate(doc.data().createdAt), updatedAt: safeToDate(doc.data().updatedAt) } as Store)));
      } catch (err) { console.error("Error fetching featured stores:", err); errors.push("stores"); }
      finally { if(isMounted) setLoadingFeaturedStores(false); }

      // Fetch Top Coupons
      setLoadingTopCoupons(true);
      try {
        const couponConstraints: QueryConstraint[] = [
          where('isActive', '==', true), where('isFeatured', '==', true), orderBy('createdAt', 'desc'),
        ];
        const fetchedCoupons = await fetchEnrichedItems<'coupons', Coupon>('coupons', couponConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS, true);
        if(isMounted) setTopCoupons(fetchedCoupons);
      } catch (err) { console.error("Error fetching top coupons:", err); errors.push("coupons"); }
      finally { if(isMounted) setLoadingTopCoupons(false); }

      // Fetch Today's Picks Products
      setLoadingTodaysPicks(true);
      try {
        const productConstraints: QueryConstraint[] = [
            where('isActive', '==', true), where('isTodaysPick', '==', true), orderBy('updatedAt', 'desc')
        ];
        const fetchedProducts = await fetchEnrichedItems<'products', Product>('products', productConstraints, ITEMS_PER_SECTION_PRODUCTS_COUPONS, true);
        if(isMounted) setTodaysPicksProducts(fetchedProducts);
      } catch (err) { console.error("Error fetching today's picks products:", err); errors.push("today's picks products"); }
      finally { if(isMounted) setLoadingTodaysPicks(false); }


      if (errors.length > 0 && isMounted) {
        const errorMessage = `Failed to load some data sections: ${errors.join(', ')}. Some content may be missing.`;
        setPageErrors(prev => [...prev, errorMessage]);
        toast({
          variant: "destructive",
          title: "Data Loading Issues",
          description: errorMessage,
          duration: 10000,
        });
      }
    };

    loadAllData();
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // Removed fetchItemsWithStoreData from deps as it's stable

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
  };

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
                      priority={index === 0} // Prioritize first banner
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
        ) : (!loadingBanners && pageErrors.some(e => e.includes("banners"))) ? null : (
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
      {loadingTodaysPicks && !todaysPicksProducts.length ? (
         <section>
            <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tp-skel-${i}`} className="h-72 rounded-lg" />)}
            </div>
         </section>
      ) : !loadingTodaysPicks && todaysPicksProducts.length > 0 ? (
        <section>
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-amber-500" /> Today's Picks</h2>
             {/* Optional: Link to a page showing all today's picks if you implement such a page */}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {todaysPicksProducts.map(product => (
              <ProductCard key={product.id} product={product} storeContext={product.store} />
            ))}
          </div>
        </section>
      ) : (!loadingTodaysPicks && pageErrors.some(e => e.includes("today's picks products"))) ? null : (
         !loadingTodaysPicks && !todaysPicksProducts.length && <div className="text-center py-6 text-muted-foreground text-sm">No special product picks for today. Check back soon!</div>
      )}

      {/* Featured Stores */}
      {loadingFeaturedStores && !featuredStores.length ? (
          <section>
            <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => <Skeleton key={`fs-skel-${i}`} className="h-40 rounded-lg" />)}
            </div>
          </section>
      ) : !loadingFeaturedStores && featuredStores.length > 0 ? (
        <section>
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-primary" /> Featured Stores</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/stores" className="flex items-center gap-1">View All <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {featuredStores.map(store => <StoreCard key={store.id} store={store} />)}
          </div>
        </section>
      ) : (!loadingFeaturedStores && pageErrors.some(e => e.includes("stores"))) ? null : (
        !loadingFeaturedStores && !featuredStores.length && <div className="text-center py-6 text-muted-foreground text-sm">No featured stores available right now.</div>
      )}


      {/* Top Coupons & Offers */}
      {loadingTopCoupons && !topCoupons.length ? (
        <section>
            <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tc-skel-${i}`} className="h-44 rounded-lg" />)}
            </div>
        </section>
      ) : !loadingTopCoupons && topCoupons.length > 0 ? (
        <section>
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Percent className="w-6 h-6 text-destructive" /> Top Coupons & Offers</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/coupons" className="flex items-center gap-1">View All <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {topCoupons.map(coupon => <CouponCard key={coupon.id} coupon={coupon} />)}
          </div>
        </section>
      ) : (!loadingTopCoupons && pageErrors.some(e => e.includes("coupons"))) ? null : (
        !loadingTopCoupons && !topCoupons.length && <div className="text-center py-6 text-muted-foreground text-sm">No top coupons featured at the moment.</div>
      )}

      {/* Popular Categories */}
      {loadingCategories && !categories.length ? (
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
      ): !loadingCategories && categories.length > 0 ? (
        <section>
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2"><List className="w-6 h-6 text-secondary" /> Popular Categories</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/categories" className="flex items-center gap-1">View All <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </div>
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
        </section>
      ): (!loadingCategories && pageErrors.some(e => e.includes("categories"))) ? null : (
        !loadingCategories && !categories.length && <div className="text-center py-6 text-muted-foreground text-sm">No categories available right now.</div>
      )}

      {pageErrors.length > 0 && (
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
