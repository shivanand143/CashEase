
"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, startAfter, QueryDocumentSnapshot, DocumentData, Timestamp, QueryConstraint } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Store, Product } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import ProductCard from '@/components/product-card'; // Updated to default import
import { AlertCircle, ArrowLeft, ShoppingBag, Info, Loader2 } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const PRODUCTS_PER_PAGE = 18;

export default function StoreProductsPage() {
  const params = useParams();
  const storeId = params.id as string;
  const router = useRouter();
  const { toast } = useToast();

  const [store, setStore] = React.useState<Store | null>(null);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loadingStore, setLoadingStore] = React.useState(true);
  const [loadingProducts, setLoadingProducts] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisibleProduct, setLastVisibleProduct] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = React.useState(true);
  const [loadingMoreProducts, setLoadingMoreProducts] = React.useState(false);

  const fetchStoreDetails = React.useCallback(async () => {
    let isMounted = true;
    if (!storeId) {
      if (isMounted) {
        setPageError("Invalid store identifier.");
        setLoadingStore(false);
      }
      return () => { isMounted = false; };
    }

    setLoadingStore(true);
    setPageError(null);

    if (!db || firebaseInitializationError) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database not available.");
        setLoadingStore(false);
      }
      return () => { isMounted = false; };
    }

    try {
      const storeDocRef = doc(db, 'stores', storeId);
      const storeSnap = await getDoc(storeDocRef);
      if (storeSnap.exists() && storeSnap.data()?.isActive) {
        const storeData = storeSnap.data();
        if (isMounted) {
          setStore({
            id: storeSnap.id,
            ...storeData,
            createdAt: safeToDate(storeData.createdAt as Timestamp | undefined),
            updatedAt: safeToDate(storeData.updatedAt as Timestamp | undefined),
          } as Store);
        }
      } else {
        throw new Error("Store not found or is not active.");
      }
    } catch (err) {
      console.error("Error fetching store details:", err);
      if (isMounted) setPageError(err instanceof Error ? err.message : "Failed to load store details.");
    } finally {
      if (isMounted) setLoadingStore(false);
    }
    return () => { isMounted = false; };
  }, [storeId]);

  const fetchStoreProducts = React.useCallback(async (
    currentStoreId: string,
    loadMoreOperation: boolean,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (!currentStoreId) {
      if (isMounted) {
        if (!loadMoreOperation) setLoadingProducts(false); else setLoadingMoreProducts(false);
      }
      return () => { isMounted = false; };
    }

    if (!db || firebaseInitializationError) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database not available for fetching products.");
        if (!loadMoreOperation) setLoadingProducts(false); else setLoadingMoreProducts(false);
        setHasMoreProducts(false);
      }
      return () => { isMounted = false; };
    }

    if (!loadMoreOperation) {
      setLoadingProducts(true);
      setProducts([]);
      setLastVisibleProduct(null);
      setHasMoreProducts(true);
    } else {
      setLoadingMoreProducts(true);
    }
    if (!loadMoreOperation) setPageError(null);

    try {
      const productsCollection = collection(db, 'products');
      const constraints: QueryConstraint[] = [
        where('storeId', '==', currentStoreId),
        where('isActive', '==', true),
        orderBy('isFeatured', 'desc'),
        orderBy('name', 'asc'),
      ];

      if (loadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(PRODUCTS_PER_PAGE));

      const q = query(productsCollection, ...constraints);
      const productSnap = await getDocs(q);

      const fetchedProducts = productSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
        updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
      } as Product));

      if (isMounted) {
        setProducts(prev => loadMoreOperation ? [...prev, ...fetchedProducts] : fetchedProducts);
        setLastVisibleProduct(productSnap.docs[productSnap.docs.length - 1] || null);
        setHasMoreProducts(fetchedProducts.length === PRODUCTS_PER_PAGE);
      }

    } catch (err) {
      console.error(`Error fetching products for store ${currentStoreId}:`, err);
      if (isMounted) {
        setPageError(err instanceof Error ? err.message : "Failed to load products.");
        setHasMoreProducts(false);
      }
    } finally {
      if (isMounted) {
        if (!loadMoreOperation) setLoadingProducts(false); else setLoadingMoreProducts(false);
      }
    }
    return () => { isMounted = false; };
  }, [toast]);

  React.useEffect(() => {
    let isMounted = true;
    if (storeId) {
      fetchStoreDetails();
      fetchStoreProducts(storeId, false, null);
    } else {
      if (isMounted) {
        setPageError("Invalid store identifier.");
        setLoadingStore(false);
        setLoadingProducts(false);
      }
    }
    return () => { isMounted = false; };
  }, [storeId, fetchStoreDetails, fetchStoreProducts]);

  React.useEffect(() => {
    if (pageError) {
      toast({ variant: "destructive", title: "Error", description: pageError });
    }
  }, [pageError, toast]);

  const handleLoadMoreProducts = () => {
    if (!loadingMoreProducts && hasMoreProducts && storeId && lastVisibleProduct) {
      fetchStoreProducts(storeId, true, lastVisibleProduct);
    }
  };

  const overallInitialLoading = loadingStore || (loadingProducts && products.length === 0);

  if (overallInitialLoading && !pageError) {
    return <StoreProductsPageSkeleton />;
  }

  if (pageError && !store && !loadingStore) {
    return (
      <div className="container mx-auto max-w-4xl text-center py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Page</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-6" onClick={() => router.push('/stores')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Stores
        </Button>
      </div>
    );
  }

  if (!store && !loadingStore && !pageError) {
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
    <div className="space-y-8">
      {store && (
        <section className="relative rounded-lg overflow-hidden shadow-lg border mb-8">
          {store.heroImageUrl ? (
            <Image
              src={store.heroImageUrl}
              alt={`${store.name} Products Banner`}
              width={1200}
              height={300}
              className="object-cover w-full h-48 md:h-56"
              data-ai-hint={`${store.name} products promotional banner`}
              priority
              onError={(e) => ((e.target as HTMLImageElement).src = 'https://placehold.co/1200x300.png')}
            />
          ) : (
            <div className="w-full h-48 md:h-56 bg-gradient-to-r from-primary/10 to-secondary/10 flex items-center justify-center">
              <h1 className="text-4xl font-bold text-white/70 drop-shadow-lg">{store.name}</h1>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col justify-end p-6">
            <div className="flex items-center gap-4 mb-2">
              {store.logoUrl && (
                <Image src={store.logoUrl} alt={`${store.name} Logo`} width={80} height={40} className="object-contain bg-white p-1 rounded-sm shadow" data-ai-hint={store.dataAiHint || `${store.name} logo`} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              )}
              <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow-lg">{store.name} Products</h1>
            </div>
            <p className="text-sm text-white/90 drop-shadow-md max-w-2xl line-clamp-2">{store.description}</p>
          </div>
        </section>
      )}

      <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Store Page
      </Button>

      <section>
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" /> Products from {store?.name || 'this Store'}
        </h2>
        {loadingProducts && products.length === 0 && !pageError ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 12 }).map((_, index) => <Skeleton key={`prod-skel-list-${index}`} className="h-64 rounded-lg" />)}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} storeContext={store} />
            ))}
          </div>
        ) : !loadingProducts && products.length === 0 && !pageError ? (
          <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
            <Info className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-lg">No products found for {store?.name || 'this store'} at the moment.</p>
            <p className="text-sm mt-1">Check back later or explore other stores.</p>
          </div>
        ) : pageError && !loadingProducts ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Products</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      {hasMoreProducts && !loadingProducts && products.length > 0 && (
        <div className="mt-10 text-center">
          <Button onClick={handleLoadMoreProducts} disabled={loadingMoreProducts}>
            {loadingMoreProducts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load More Products
          </Button>
        </div>
      )}
    </div>
  );
}

function StoreProductsPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-48 md:h-56 w-full rounded-lg mb-8" />
      <Skeleton className="h-9 w-32 mb-4" />
      <Skeleton className="h-8 w-1/3 mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={`prod-skel-page-${index}`} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
