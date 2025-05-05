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
import { Search, Tag, ShoppingBag, ArrowRight, IndianRupee, HandCoins, BadgePercent, Zap, Building2, Gift, TrendingUp, ExternalLink, ScrollText, Info } from 'lucide-react'; // Added missing icons
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, query, where, limit, orderBy, QueryConstraint, DocumentData, getDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, Coupon, Banner, Category } from '@/lib/types'; // Added Category
import { Skeleton } from '@/components/ui/skeleton';
import StoreCard from '@/components/store-card'; // Assuming you have this component
import CouponCard from '@/components/coupon-card'; // Assuming you have this component
import { useRouter } from 'next/navigation'; // Import useRouter
import { safeToDate } from '@/lib/utils'; // Import safeToDate
import { ProductCard } from '@/components/product-card'; // Fixed import path
import { AmazonProduct } from '@/lib/amazon/amazon-paapi'; // Import AmazonProduct type
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'; // Added Alert components
import { AlertCircle } from 'lucide-react'; // Added AlertCircle

// --- Helper Types ---
interface CouponWithStore extends Coupon {
  store?: Store; // Optional nested store data
}

// --- Helper to fetch data ---
async function fetchData<T>(collectionName: string, constraints: QueryConstraint[] = [], orderField?: string, orderDirection?: 'asc' | 'desc', fetchLimit?: number): Promise<T[]> {
    let data: T[] = [];
    if (!db) {
        console.warn(`Firestore DB not initialized when fetching ${collectionName}.`);
        // Return empty array instead of throwing error to allow partial page load
        return [];
        // throw new Error("Database not available.");
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
        data = querySnapshot.docs.map(docSnap => {
            const docData = docSnap.data();
            // Convert timestamps proactively
            const convertedData = Object.keys(docData).reduce((acc, key) => {
                if (docData[key] instanceof Timestamp) {
                    acc[key] = safeToDate(docData[key]); // Convert timestamp to Date
                } else {
                    acc[key] = docData[key];
                }
                return acc;
            }, {} as any); // Use 'any' carefully or define a more specific type transformation

            return { id: docSnap.id, ...convertedData } as T;
        });
    } catch (err) {
        console.error(`Error fetching ${collectionName}:`, err);
        // Don't re-throw, allow function to return empty array on error
        // throw err;
    }
    return data;
}


// --- Helper to fetch coupons and enrich with store data ---
async function fetchCouponsWithStoreData(constraints: QueryConstraint[], orderField?: string, orderDirection?: 'asc' | 'desc', fetchLimit?: number): Promise<CouponWithStore[]> {
    let coupons: Coupon[] = [];
    let enrichedCoupons: CouponWithStore[] = [];

    try {
        coupons = await fetchData<Coupon>('coupons', constraints, orderField, orderDirection, fetchLimit);

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
                             // Ensure timestamps are converted if they exist
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
        // Don't re-throw, allow function to return empty array on error
        // throw err;
    }
    return enrichedCoupons;
}

// --- Amazon Products (Placeholder/Example) ---
// In a real scenario, this would come from an API call
const exampleAmazonProducts: AmazonProduct[] = [
    { ASIN: 'B08N5WRWNW', Title: 'Echo Dot (4th Gen) | Smart speaker with Alexa | Glacier White', Price: '₹3,499', ImageURL: 'https://picsum.photos/seed/echodot/200/200', DetailPageURL: '#', Category: 'Electronics' },
    { ASIN: 'B09G9HD6PD', Title: 'Fire TV Stick 4K Max streaming device, Wi-Fi 6 compatible', Price: '₹4,499', ImageURL: 'https://picsum.photos/seed/firetv/200/200', DetailPageURL: '#', Category: 'Electronics' },
    { ASIN: 'B08C1KN5J2', Title: 'OnePlus Nord CE 2 Lite 5G (Blue Tide, 6GB RAM, 128GB Storage)', Price: '₹18,999', ImageURL: 'https://picsum.photos/seed/oneplusnord/200/200', DetailPageURL: '#', Category: 'Mobiles & Tablets' },
    { ASIN: 'B09WQY65HN', Title: 'boAt Airdopes 141 Bluetooth Truly Wireless in Ear Earbuds', Price: '₹1,099', ImageURL: 'https://picsum.photos/seed/boat141/200/200', DetailPageURL: '#', Category: 'Electronics' },
    { ASIN: 'B07HHD7SXM', Title: 'MI Power Bank 3i 20000mAh Lithium Polymer 18W Fast PD Charging', Price: '₹1,799', ImageURL: 'https://picsum.photos/seed/mipowerbank/200/200', DetailPageURL: '#', Category: 'Mobiles & Tablets' },
    { ASIN: 'B09MQ9X6XZ', Title: 'HP 15s, 11th Gen Intel Core i3-1115G4, 15.6-inch Laptop', Price: '₹38,990', ImageURL: 'https://picsum.photos/seed/hplaptop/200/200', DetailPageURL: '#', Category: 'Electronics' },
];

// --- HomePage Component ---
export default function HomePage() {
  const { toast } = useToast();
  const router = useRouter();
  const [banners, setBanners] = React.useState<Banner[]>([]);
  const [featuredStores, setFeaturedStores] = React.useState<Store[]>([]);
  const [topCoupons, setTopCoupons] = React.useState<CouponWithStore[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]); // State for categories
  const [amazonProducts, setAmazonProducts] = React.useState<AmazonProduct[]>([]);
  const [loadingBanners, setLoadingBanners] = React.useState(true);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [loadingCoupons, setLoadingCoupons] = React.useState(true);
  const [loadingCategories, setLoadingCategories] = React.useState(true); // Loading state for categories
  const [loadingProducts, setLoadingProducts] = React.useState(true); // Added loading state for products
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');

  // Combined data loading effect
  React.useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component
    const loadAllData = async () => {
      setLoadingBanners(true);
      setLoadingStores(true);
      setLoadingCoupons(true);
      setLoadingCategories(true); // Set loading true for categories
      setLoadingProducts(true);
      setError(null);
      let combinedErrorMessages: string[] = []; // Store multiple error messages

      try {
        // Fetch Banners
        const bannerFetchPromise = fetchData<Banner>(
          'banners', [where('isActive', '==', true)], 'order', 'asc', 5 // Limit banners
        ).catch(err => {
            console.error("Banner fetch failed:", err);
            combinedErrorMessages.push("banners");
            return [];
        });

        // Fetch Featured Stores
        const storeFetchPromise = fetchData<Store>(
          'stores', [where('isActive', '==', true), where('isFeatured', '==', true)], 'name', 'asc', 12
        ).catch(err => {
            console.error("Store fetch failed:", err);
            combinedErrorMessages.push("stores");
            return [];
        });

        // Fetch Top Coupons (enriched)
        const couponFetchPromise = fetchCouponsWithStoreData(
          [where('isActive', '==', true)], 'isFeatured', 'desc', 6
        ).catch(err => {
            console.error("Coupon fetch failed:", err);
            combinedErrorMessages.push("coupons");
            return [];
        });

         // Fetch Top Categories
         const categoryFetchPromise = fetchData<Category>(
             'categories', [], 'order', 'asc', 12 // Limit categories for homepage display
         ).catch(err => {
             console.error("Category fetch failed:", err);
             combinedErrorMessages.push("categories");
             return [];
         });

        // Fetch Amazon Products (Placeholder)
        const productFetchPromise = new Promise<AmazonProduct[]>((resolve) => {
          setTimeout(() => resolve(exampleAmazonProducts), 700);
        }).catch(err => {
            console.error("Product fetch failed:", err);
            combinedErrorMessages.push("products");
            return [];
        });


        // Await all promises
        const [bannerData, storeData, couponData, categoryData, productData] = await Promise.all([
            bannerFetchPromise,
            storeFetchPromise,
            couponFetchPromise,
            categoryFetchPromise, // Add category promise
            productFetchPromise
        ]);

        // Update state only if component is still mounted
        if (isMounted) {
          setBanners(bannerData);
          setFeaturedStores(storeData);
          setTopCoupons(couponData);
          setCategories(categoryData); // Set categories state
          setAmazonProducts(productData);
           if (combinedErrorMessages.length > 0) {
               setError(`Failed to load: ${combinedErrorMessages.join(', ')}.`);
           }
        }

      } catch (err) { // Catch potential errors from Promise.all itself
        if (isMounted) {
           console.error("Error loading page data:", err);
           setError("Failed to load some page data. Please try again.");
        }
      } finally {
        // Set loading states regardless of errors, only if mounted
        if (isMounted) {
          setLoadingBanners(false);
          setLoadingStores(false);
          setLoadingCoupons(false);
          setLoadingCategories(false); // Set loading false for categories
          setLoadingProducts(false);
        }
      }
    };

    loadAllData();

    // Cleanup function to set isMounted to false when the component unmounts
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array ensures this runs only once on mount


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

  const isLoading = loadingBanners || loadingStores || loadingCoupons || loadingCategories || loadingProducts;

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">

      {/* Hero Section with Search */}
       <section className="relative text-center py-12 md:py-16 lg:py-20 bg-gradient-to-br from-primary/10 via-background to-secondary/10 rounded-lg shadow-sm overflow-hidden border border-border/50">
           {/* Background Image/Pattern (Optional) */}
           {/* <div className="absolute inset-0 opacity-5 bg-[url('/hero-pattern.svg')] bg-repeat"></div> */}
           <div className="container relative z-10 px-4 md:px-6">
             <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-foreground">
               Shop Smarter, Earn <span className="text-primary">CashEase</span> Back!
             </h1>
             <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
               Get real cashback and find the best coupons for 1500+ online stores in India. Join free today!
             </p>
             <form onSubmit={handleSearchSubmit} className="relative mb-8 max-w-2xl mx-auto">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
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
               loop: banners.length > 1,
             }}
           >
             <CarouselContent>
               {banners.map((banner, index) => (
                 <CarouselItem key={banner.id || index}>
                   <Link href={banner.link || '#'} target={banner.link ? "_blank" : undefined} rel="noopener noreferrer" className="block relative aspect-[2/1] md:aspect-[3/1] lg:aspect-[4/1] overflow-hidden rounded-lg shadow-md group border border-border/30">
                     <Image
                       src={banner.imageUrl || 'https://picsum.photos/seed/placeholderbanner/1200/400'}
                       alt={banner.altText || 'Promotional Banner'}
                       fill
                       sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
                       className="object-cover transition-transform duration-300 group-hover:scale-105"
                       priority={index === 0}
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
             {banners.length > 1 && (
               <>
                 <CarouselPrevious className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background border-border shadow-md disabled:opacity-50" />
                 <CarouselNext className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background border-border shadow-md disabled:opacity-50" />
               </>
             )}
           </Carousel>
         ) : !error ? ( // Show "No deals" only if not loading and no error
             <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg border">
                No special deals featured right now. Check back soon!
             </div>
          ) : null /* Don't show anything if there was an error */ }
       </section>


      {/* --- How it Works Section --- */}
      <section className="container px-4 md:px-6 py-12 text-center bg-muted/30 rounded-lg border">
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

        {/* --- Popular Categories Section --- */}
        <section className="container px-4 md:px-6">
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
                             className="object-contain mb-3 h-16 w-16"
                             data-ai-hint={`${category.name} icon illustration`}
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
           ) : !error ? (
               <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">No categories found.</p>
           ): null}
       </section>


      {/* --- Featured Stores Section --- */}
      <section className="container px-4 md:px-6">
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
        ) : !error ? (
          <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">No featured stores available right now.</p>
        ) : null}
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
              <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : topCoupons.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {topCoupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        ) : !error ? (
          <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">No top coupons available at the moment.</p>
        ): null}
      </section>

       {/* --- Amazon Products Feed --- */}
      <section className="container px-4 md:px-6">
         <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2">
               {/* Use an inline SVG or a simple text fallback if image isn't available */}
                {/* <Image src="/amazon-logo.svg" alt="Amazon Logo" width={100} height={30} className="h-8 w-auto object-contain"/> */}
                <span className="font-amazon-ember" aria-label="Amazon">Amazon</span> Today's Picks
            </h2>
             {/* Link to a potential Amazon store page on your site */}
            <Button variant="outline" size="sm" asChild>
              <Link href="/stores/amazon" className="flex items-center gap-1">
                 View Amazon Offers <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
         </div>
          {loadingProducts ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={`product-skel-${index}`} className="h-64 rounded-lg" />
                  ))}
              </div>
          ) : amazonProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                  {amazonProducts.map((product) => (
                      <ProductCard key={product.ASIN} product={product} />
                  ))}
              </div>
          ) : !error ? (
              <p className="text-muted-foreground text-center py-8 bg-muted/50 rounded-lg border">Could not load product recommendations.</p>
          ) : null}
       </section>


      {/* --- Maximize Savings & Referral Sections --- */}
       <section className="container px-4 md:px-6 grid md:grid-cols-2 gap-8">
           {/* Maximize Savings */}
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
            {/* Referral */}
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

      {/* Optional: Error Alert for partial data load */}
      {error && !isLoading && (
         <div className="container px-4 md:px-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Data Loading Issue</AlertTitle>
              <AlertDescription>
                Some sections of the page might not have loaded correctly ({error}). Please try refreshing the page.
              </AlertDescription>
            </Alert>
         </div>
       )}

    </div>
  );
}

// Basic CSS for Amazon font (add to globals.css or similar)
/*
@font-face {
  font-family: 'Amazon Ember';
  src: url('/fonts/AmazonEmber_Rg.woff2') format('woff2'),
       url('/fonts/AmazonEmber_Rg.woff') format('woff');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
.font-amazon-ember {
  font-family: 'Amazon Ember', Arial, sans-serif;
}
*/
