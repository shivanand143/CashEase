// src/app/category/[slug]/page.tsx
"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Category, Store, Coupon, CouponWithStore } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import StoreCard from '@/components/store-card'; // Corrected import path
import CouponCard from '@/components/coupon-card';
import { AlertCircle, ArrowLeft, List, ShoppingBag, Tag } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast'; // Import useToast

const ITEMS_PER_PAGE = 12;

export default function CategoryPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { toast } = useToast(); // Initialize useToast

  const [category, setCategory] = React.useState<Category | null>(null);
  const [stores, setStores] = React.useState<Store[]>([]);
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loadingCategory, setLoadingCategory] = React.useState(true);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [loadingCoupons, setLoadingCoupons] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null); // Renamed for clarity

  React.useEffect(() => {
    let isMounted = true;
    if (!slug || typeof slug !== 'string') {
      if (isMounted) {
        setPageError("Invalid category identifier.");
        setLoadingCategory(false);
        setLoadingStores(false);
        setLoadingCoupons(false);
      }
      return;
    }

    const fetchCategoryData = async () => {
      if (!isMounted) return;
      setLoadingCategory(true);
      setLoadingStores(true);
      setLoadingCoupons(true);
      setPageError(null);

      if (firebaseInitializationError) {
        if(isMounted) {
            setPageError(`Database initialization failed: ${firebaseInitializationError}`);
            setLoadingCategory(false);
            setLoadingStores(false);
            setLoadingCoupons(false);
        }
        return;
      }
      if (!db) {
        if (isMounted) {
          setPageError("Database connection not available.");
          setLoadingCategory(false);
          setLoadingStores(false);
          setLoadingCoupons(false);
        }
        return;
      }

      try {
        // Fetch Category Details
        const categoryQuery = query(collection(db, 'categories'), where('slug', '==', slug), where('isActive','==',true), limit(1));
        const categorySnap = await getDocs(categoryQuery);

        if (categorySnap.empty) {
          throw new Error(`Category "${slug}" not found or is not active.`);
        }
        const categoryDataRaw = categorySnap.docs[0].data();
        const fetchedCategory = {
            id: categorySnap.docs[0].id,
            ...categoryDataRaw,
            createdAt: safeToDate(categoryDataRaw.createdAt as Timestamp | undefined),
            updatedAt: safeToDate(categoryDataRaw.updatedAt as Timestamp | undefined),
         } as Category;
        if (isMounted) setCategory(fetchedCategory);

        // Fetch Stores in this Category
        const storesQuery = query(
          collection(db, 'stores'),
          where('categories', 'array-contains', slug), // Use slug directly if category IDs are slugs
          where('isActive', '==', true),
          orderBy('isFeatured', 'desc'),
          orderBy('name', 'asc'),
          limit(ITEMS_PER_PAGE)
        );
        const storesSnap = await getDocs(storesQuery);
        const fetchedStores = storesSnap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
          updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
        } as Store));
        if (isMounted) setStores(fetchedStores);

        // Fetch Coupons for stores in this category
        if (fetchedStores.length > 0) {
          const storeIds = fetchedStores.map(s => s.id);
          // Firestore 'in' queries are limited to 30 elements per query.
          // If storeIds can exceed this, chunk the queries. For simplicity, assuming <= 30 for now.
          const maxStoreIdsPerQuery = 30;
          const storeIdChunks = [];
          for (let i = 0; i < storeIds.length; i += maxStoreIdsPerQuery) {
            storeIdChunks.push(storeIds.slice(i, i + maxStoreIdsPerQuery));
          }
          
          let allFetchedCouponsRaw: Coupon[] = [];

          for (const chunk of storeIdChunks) {
            if (chunk.length === 0) continue;
            const couponsQuery = query(
              collection(db, 'coupons'),
              where('storeId', 'in', chunk),
              where('isActive', '==', true),
              orderBy('isFeatured', 'desc'),
              orderBy('createdAt', 'desc'),
              limit(ITEMS_PER_PAGE) // Limit per chunk, might need adjustment for total limit
            );
            const couponsSnap = await getDocs(couponsQuery);
            const chunkCoupons = couponsSnap.docs.map(d => ({
              id: d.id,
              ...d.data(),
              expiryDate: safeToDate(d.data().expiryDate as Timestamp | undefined),
              createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
              updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
            } as Coupon));
            allFetchedCouponsRaw.push(...chunkCoupons);
          }
          

          const storeCache = new Map<string, Store>(fetchedStores.map(s => [s.id, s]));
          const enrichedCoupons = await Promise.all(
            allFetchedCouponsRaw.map(async (coupon) => {
              if (coupon.storeId && storeCache.has(coupon.storeId)) {
                return { ...coupon, store: storeCache.get(coupon.storeId)! };
              }
              if (coupon.storeId && db) { // Fallback if store not in initial fetch (e.g. more coupons than stores)
                const storeDoc = await getDoc(doc(db, 'stores', coupon.storeId));
                if (storeDoc.exists()) {
                    const storeDataRaw = storeDoc.data();
                    return { ...coupon, store: {
                        id: storeDoc.id, ...storeDataRaw,
                        createdAt: safeToDate(storeDataRaw.createdAt as Timestamp | undefined),
                        updatedAt: safeToDate(storeDataRaw.updatedAt as Timestamp | undefined),
                    } as Store };
                }
              }
              return coupon;
            })
          );
          if (isMounted) setCoupons(enrichedCoupons.slice(0, ITEMS_PER_PAGE)); // Ensure total limit
        } else {
          if (isMounted) setCoupons([]);
        }

      } catch (err) {
        console.error(`Error fetching data for category ${slug}:`, err);
        if (isMounted) setPageError(err instanceof Error ? err.message : "Failed to load category data.");
      } finally {
        if (isMounted) {
          setLoadingCategory(false);
          setLoadingStores(false);
          setLoadingCoupons(false);
        }
      }
    };

    fetchCategoryData();
    return () => { isMounted = false; };
  }, [slug]);

  React.useEffect(() => {
    if (pageError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: pageError,
      });
    }
  }, [pageError, toast]);

  const overallLoading = loadingCategory || loadingStores || loadingCoupons;

  if (overallLoading && !category && !pageError) {
    return <CategoryPageSkeleton />;
  }

  if (pageError && !category) { // Show error prominently if category itself failed to load
    return (
      <div className="container mx-auto max-w-4xl text-center py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Category</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-6" onClick={() => router.push('/categories')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Categories
        </Button>
      </div>
    );
  }
  
  if (!category && !overallLoading) { // Fallback if category is null after loading and no error state
    return (
      <div className="text-center py-16 text-muted-foreground">
        Category not found. It might have been removed or the link is incorrect.
        <Button variant="link" onClick={() => router.push('/categories')} className="block mx-auto mt-2">
          Browse All Categories
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {category && (
          <section className="text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2 flex items-center justify-center gap-3">
            {category.imageUrl ? (
                <Image src={category.imageUrl} alt={category.name} width={48} height={48} className="rounded-md object-contain" />
            ) : (
                <List className="w-10 h-10 text-primary" />
            )}
            {category.name}
            </h1>
            {category.description && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{category.description}</p>
            )}
        </section>
      )}

      {/* Stores in this Category */}
      <section>
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" /> Stores in {category?.name || 'this category'}
        </h2>
        {loadingStores ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-48 rounded-lg" />)}
          </div>
        ) : stores.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8 bg-muted/30 rounded-lg border">No stores found in this category yet.</p>
        )}
      </section>

      {/* Coupons for this Category/Stores */}
      <section>
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <Tag className="w-6 h-6 text-primary" /> Coupons & Deals in {category?.name || 'this category'}
        </h2>
        {loadingCoupons ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-lg" />)}
          </div>
        ) : coupons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8 bg-muted/30 rounded-lg border">No coupons found for this category at the moment.</p>
        )}
      </section>

      <div className="text-center mt-12">
        <Button variant="outline" onClick={() => router.push('/categories')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> View All Categories
        </Button>
      </div>
    </div>
  );
}

// Skeleton Loader Component
function CategoryPageSkeleton() {
  return (
    <div className="space-y-10">
      <section className="text-center space-y-3">
        <Skeleton className="h-12 w-12 mx-auto rounded-md" />
        <Skeleton className="h-10 w-1/2 mx-auto" /> {/* Title */}
        <Skeleton className="h-5 w-3/4 mx-auto" /> {/* Description */}
      </section>

      <section>
        <Skeleton className="h-8 w-1/3 mb-6" /> {/* Section Title */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`store-skel-${index}`} className="h-48 rounded-lg" />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="h-8 w-1/3 mb-6" /> {/* Section Title */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
