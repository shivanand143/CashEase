
"use client";

import * as React from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
  Timestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types'; // Ensure Store is imported if coupon.store is used
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import CouponCard from '@/components/coupon-card'; // Correct path
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Tag, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate } from '@/lib/utils';

const COUPONS_PER_PAGE = 12;

interface CouponWithStoreData extends Coupon {
  store?: Store;
}

function CouponsPageSkeleton() {
  const COUPONS_PER_PAGE_SKELETON = 9;
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-3/4 md:w-1/2 mx-auto" /> {/* Title */}
      <Skeleton className="h-5 w-full md:w-3/4 lg:w-1/2 mx-auto" /> {/* Subtitle */}

      <Card className="max-w-xl mx-auto shadow-sm border">
        <CardHeader className="pb-4 pt-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent className="pb-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {Array.from({ length: COUPONS_PER_PAGE_SKELETON }).map((_, index) => (
          <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function CouponsPage() {
  const [coupons, setCoupons] = React.useState<CouponWithStoreData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();

  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  const fetchCouponsWithStores = React.useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!isLoadMoreOperation) {
      setLoading(true);
      setCoupons([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      if (!docToStartAfter && isLoadMoreOperation) {
        if (isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      setLoadingMore(true);
    }
    if (!isLoadMoreOperation) setError(null);
    setIsSearching(currentSearchTerm !== '');

    try {
      const couponsCollection = collection(db, 'coupons');
      const constraints: QueryConstraint[] = [where('isActive', '==', true)];

      if (currentSearchTerm) {
        constraints.push(orderBy('description')); // Order by description for text search
        constraints.push(where('description', '>=', currentSearchTerm));
        constraints.push(where('description', '<=', currentSearchTerm + '\uf8ff'));
      } else {
        constraints.push(orderBy('isFeatured', 'desc'));
        constraints.push(orderBy('createdAt', 'desc'));
      }

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(COUPONS_PER_PAGE));

      const q = query(couponsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const rawCoupons: Coupon[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          storeId: data.storeId,
          code: data.code,
          description: data.description,
          link: data.link,
          title: data.title,
          cashback: data.cashback,
          isFeatured: data.isFeatured,
          isActive: data.isActive,
          expiryDate: data.expiryDate ?? null,
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      
      
      

      const storeCache = new Map<string, Store>();
      const enrichedCoupons: CouponWithStoreData[] = [];

      for (const coupon of rawCoupons) {
        let storeData: Store | undefined = undefined;
        if (coupon.storeId) {
          if (storeCache.has(coupon.storeId)) {
            storeData = storeCache.get(coupon.storeId);
          } else if (db) {
            try {
              const storeDocRef = doc(db, 'stores', coupon.storeId);
              const storeDocSnap = await getDoc(storeDocRef);
              if (storeDocSnap.exists()) {
                const rawStore = storeDocSnap.data();
                storeData = {
                  id: storeDocSnap.id, ...rawStore,
                  createdAt: safeToDate(rawStore.createdAt as Timestamp | undefined),
                  updatedAt: safeToDate(rawStore.updatedAt as Timestamp | undefined),
                } as unknown as Store;
                storeCache.set(coupon.storeId, storeData);
              }
            } catch (storeFetchError) {
              console.error(`Failed to fetch store ${coupon.storeId} for coupon ${coupon.id}:`, storeFetchError);
            }
          }
        }
        enrichedCoupons.push({ ...coupon, store: storeData });
      }
      
      if (isMounted) {
        if (isLoadMoreOperation) {
          setCoupons(prev => [...prev, ...enrichedCoupons]);
        } else {
          setCoupons(enrichedCoupons);
        }
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        setLastVisible(newLastVisible);
        setHasMore(querySnapshot.docs.length === COUPONS_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching coupons:", err);
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch coupons";
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [toast]);

  React.useEffect(() => {
    fetchCouponsWithStores(false, debouncedSearchTerm, null);
  }, [debouncedSearchTerm, fetchCouponsWithStores]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Fetching is triggered by debouncedSearchTerm change
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchCouponsWithStores(true, debouncedSearchTerm, lastVisible);
    }
  };

  if (loading && coupons.length === 0 && !error) {
    return <CouponsPageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2 flex items-center justify-center gap-3">
          <Tag className="w-10 h-10 text-primary" /> All Coupons & Deals
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Find the latest coupons and offers from your favorite online stores. Save big on every purchase!
        </p>
      </section>

      <Card className="max-w-xl mx-auto shadow-sm border">
        <CardHeader className="pb-4 pt-4">
          <CardTitle className="text-lg">Search Coupons</CardTitle>
          <CardDescription>Find coupons by keyword or description.</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              type="search"
              placeholder="Search e.g., 'extra 10% off' or 'fashion sale'..."
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              disabled={isSearching || loading}
              className="h-10 text-base"
            />
            <Button type="submit" disabled={isSearching || loading} className="h-10">
              {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && !loading && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Coupons</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && coupons.length === 0 && !error && (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
          <p className="text-xl mb-4">
            {debouncedSearchTerm ? `No coupons found matching "${debouncedSearchTerm}".` : "No coupons available at the moment."}
          </p>
          {debouncedSearchTerm && <p>Try a different search term or browse all coupons.</p>}
        </div>
      )}

      {coupons.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {coupons.map((coupon) => (
            <CouponCard key={coupon.id} coupon={coupon} />
          ))}
        </div>
      )}

      {hasMore && !loading && coupons.length > 0 && (
        <div className="mt-10 text-center">
          <Button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load More Coupons
          </Button>
        </div>
      )}
      {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
    </div>
  );
}
