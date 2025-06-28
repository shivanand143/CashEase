
// src/app/category/[slug]/page.tsx
"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Category, Store, Coupon, CouponWithStore, Product } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import StoreCard from '@/components/store-card';
import CouponCard from '@/components/coupon-card';
import ProductCard from '@/components/product-card';
import { AlertCircle, ArrowLeft, List, ShoppingBag, Tag } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const ITEMS_PER_PAGE = 12;

export default function CategoryPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { toast } = useToast();

  const [category, setCategory] = React.useState<Category | null>(null);
  const [stores, setStores] = React.useState<Store[]>([]);
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [products, setProducts] = React.useState<(Product & { store?: Store })[]>([]);
  const [loadingCategory, setLoadingCategory] = React.useState(true);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [loadingCoupons, setLoadingCoupons] = React.useState(true);
  const [loadingProducts, setLoadingProducts] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);


  React.useEffect(() => {
    let isMounted = true;
    if (!slug || typeof slug !== 'string') {
      if (isMounted) {
        setPageError("Invalid category identifier.");
        setLoadingCategory(false);
        setLoadingStores(false);
        setLoadingCoupons(false);
        setLoadingProducts(false);
      }
      return;
    }

    const fetchCategoryData = async () => {
      if (!isMounted) return;
      setLoadingCategory(true);
      setLoadingStores(true);
      setLoadingCoupons(true);
      setLoadingProducts(true);
      setPageError(null);

      if (firebaseInitializationError || !db) {
        if (isMounted) {
          setPageError(firebaseInitializationError || "Database connection not available.");
          setLoadingCategory(false);
          setLoadingStores(false);
          setLoadingCoupons(false);
          setLoadingProducts(false);
        }
        return;
      }

      try {
        const categoryQuery = query(collection(db, 'categories'), where('slug', '==', slug), where('isActive', '==', true), limit(1));
        const categorySnap = await getDocs(categoryQuery);

        if (categorySnap.empty) {
          throw new Error(`Category "${slug}" not found or is not active.`);
        }
        const categoryDataRaw = categorySnap.docs[0].data();
        const categoryId = categorySnap.docs[0].id;
        const fetchedCategory = {
          id: categoryId,
          name: categoryDataRaw.name || '',
          slug: categoryDataRaw.slug || '',
          order: categoryDataRaw.order ?? 0,
          isActive: categoryDataRaw.isActive ?? true,
          imageUrl: categoryDataRaw.imageUrl || '',
          description: categoryDataRaw.description || '',
          dataAiHint: categoryDataRaw.dataAiHint || '',
          createdAt: categoryDataRaw.createdAt as Timestamp,
          updatedAt: categoryDataRaw.updatedAt as Timestamp,
        } satisfies Category;
        
        if (isMounted) {
          setCategory(fetchedCategory);
          setLoadingCategory(false);

          // Fetch Stores, Products, and Coupons in parallel after getting the category ID
          const storesPromise = (async () => {
            const storesQuery = query(
              collection(db, 'stores'),
              where('categories', 'array-contains', categoryId),
              where('isActive', '==', true),
              orderBy('isFeatured', 'desc'),
              orderBy('name', 'asc'),
              limit(ITEMS_PER_PAGE)
            );
            const storesSnap = await getDocs(storesQuery);
            return storesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Store));
          })();

          const productsPromise = (async () => {
            const productsQuery = query(
              collection(db, 'products'),
              where('category', '==', categoryId),
              where('isActive', '==', true),
              orderBy('isFeatured', 'desc'),
              limit(ITEMS_PER_PAGE)
            );
            const productsSnap = await getDocs(productsQuery);
            return productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
          })();

          const [fetchedStores, fetchedProducts] = await Promise.all([storesPromise, productsPromise]);

          if (isMounted) {
            setStores(fetchedStores.map(data => ({
              ...data,
              createdAt: safeToDate(data.createdAt as Timestamp | undefined),
              updatedAt: safeToDate(data.updatedAt as Timestamp | undefined),
            } as unknown as Store)));
            setLoadingStores(false);

            const storeCache = new Map<string, Store>(fetchedStores.map(s => [s.id, s]));
            const enrichedProducts = await Promise.all(fetchedProducts.map(async (product) => {
                let storeForProduct = storeCache.get(product.storeId);
                if (!storeForProduct && db) {
                    const storeDoc = await getDoc(doc(db, 'stores', product.storeId));
                    if (storeDoc.exists()) {
                        storeForProduct = { id: storeDoc.id, ...storeDoc.data() } as Store;
                        storeCache.set(product.storeId, storeForProduct);
                    }
                }
                return { ...product, store: storeForProduct };
            }));

            setProducts(enrichedProducts.map(data => ({
              ...data,
              createdAt: safeToDate(data.createdAt as Timestamp | undefined),
              updatedAt: safeToDate(data.updatedAt as Timestamp | undefined),
            } as unknown as (Product & { store?: Store }))));
            setLoadingProducts(false);

            if (fetchedStores.length > 0) {
              const storeIds = fetchedStores.map(s => s.id);
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
                  limit(ITEMS_PER_PAGE)
                );
                const couponsSnap = await getDocs(couponsQuery);
                const chunkCoupons = couponsSnap.docs.map((d) => ({
                  id: d.id,
                  ...d.data(),
                  expiryDate: safeToDate(d.data().expiryDate as Timestamp | undefined),
                  createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
                  updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
                } as unknown as Coupon));
                allFetchedCouponsRaw.push(...chunkCoupons);
              }

              const enrichedCoupons: CouponWithStore[] = await Promise.all(
                allFetchedCouponsRaw.map(async (coupon) => {
                  let storeName = 'Unknown Store';
                  let storeLogoUrl: string | undefined = undefined;
                  if (coupon.storeId && storeCache.has(coupon.storeId)) {
                    const cachedStore = storeCache.get(coupon.storeId)!;
                    storeName = cachedStore.name || 'Unknown Store';
                    storeLogoUrl = cachedStore.logoUrl || undefined;
                  }
                  return { ...coupon, storeName, storeLogoUrl };
                })
              );
              if (isMounted) setCoupons(enrichedCoupons.slice(0, ITEMS_PER_PAGE));
            } else {
              if (isMounted) setCoupons([]);
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching data for category ${slug}:`, err);
        if (isMounted) setPageError(err instanceof Error ? err.message : "Failed to load category data.");
      } finally {
        if (isMounted) {
          setLoadingCategory(false);
          setLoadingStores(false);
          setLoadingCoupons(false);
          setLoadingProducts(false);
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

  const overallLoading = loadingCategory || loadingStores || loadingCoupons || loadingProducts;

  if (overallLoading && !category && !pageError) {
    return <CategoryPageSkeleton />;
  }

  if (pageError && !category) {
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
  
  if (!category && !overallLoading) {
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

      {/* Products in this Category */}
      <section>
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" /> Products in {category?.name || 'this category'}
        </h2>
        {loadingProducts ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={`prod-skel-${index}`} className="h-64 rounded-lg" />)}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} storeContext={product.store} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8 bg-muted/30 rounded-lg border">No products found for this category at the moment.</p>
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
        <Skeleton className="h-8 w-1/3 mb-6" /> {/* Products Section Title */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`product-skel-${index}`} className="h-64 rounded-lg" />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="h-8 w-1/3 mb-6" /> {/* Coupons Section Title */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
