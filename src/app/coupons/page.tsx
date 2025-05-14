
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
  getDoc,
  doc,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Coupon, Store, CouponWithStore } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import CouponCard from '@/components/coupon-card'; // Corrected import path
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Tag, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate } from '@/lib/utils';

const COUPONS_PER_PAGE = 18;

export default function CouponsPage() {
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastVisibleRef = React.useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const enrichCouponsWithStoreData = async (couponsToEnrich: Coupon[]): Promise<CouponWithStore[]> => {
    if (couponsToEnrich.length === 0) return [];
    if (!db) {
      console.warn("DB not available for store fetch in enrichCouponsWithStoreData");
      return couponsToEnrich; // Return as is if DB not available
    }

    const storeCache = new Map<string, Store>();
    const enrichedPromises = couponsToEnrich.map(async (coupon) => {
      if (!coupon.storeId) return coupon;
      if (storeCache.has(coupon.storeId)) {
        return { ...coupon, store: storeCache.get(coupon.storeId)! };
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
    return Promise.all(enrichedPromises);
  };


  React.useEffect(() => {
    let isMounted = true;
    const fetchInitialOrSearchCoupons = async () => {
      if (!isMounted) return;

      setLoading(true);
      setError(null);
      setCoupons([]);
      lastVisibleRef.current = null;
      setHasMore(true);

      if (!db) {
        if (isMounted) {
          setError("Database connection not available.");
          setLoading(false);
          setHasMore(false);
        }
        return;
      }

      try {
        const couponsCollection = collection(db, 'coupons');
        const constraints = [
          where('isActive', '==', true),
          orderBy('createdAt', 'desc')
        ];
        // Client-side search for description: Fetch more initially then filter.
        // This isn't ideal for very large datasets but works for moderate ones.
        // For production with large data, consider a search service like Algolia or Typesense.
        constraints.push(limit(debouncedSearchTerm ? COUPONS_PER_PAGE * 5 : COUPONS_PER_PAGE)); // Fetch more if searching

        const q = query(couponsCollection, ...constraints);
        const couponSnapshot = await getDocs(q);

        let fetchedCoupons = couponSnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          expiryDate: safeToDate(docSnap.data().expiryDate),
          createdAt: safeToDate(docSnap.data().createdAt),
          updatedAt: safeToDate(docSnap.data().updatedAt),
        } as Coupon));

        if (debouncedSearchTerm) {
          const lowerSearch = debouncedSearchTerm.toLowerCase();
          fetchedCoupons = fetchedCoupons.filter(c =>
            c.description.toLowerCase().includes(lowerSearch) ||
            (c.store?.name || '').toLowerCase().includes(lowerSearch) // Also search by store name if available
          ).slice(0, COUPONS_PER_PAGE); // Apply limit after client-side filter
        }
        
        const enrichedCoupons = await enrichCouponsWithStoreData(fetchedCoupons);

        if (isMounted) {
          setCoupons(enrichedCoupons);
          // Set lastVisible based on original snapshot if not searching, or last of filtered if searching
          // This logic might need refinement if client-side filtering drastically reduces results.
          // For simplicity now, we use the snapshot's last doc, which is fine if client filter doesn't remove all.
          lastVisibleRef.current = couponSnapshot.docs[couponSnapshot.docs.length - 1] || null;
          // hasMore should be based on original fetch limit before client-side filtering for description
          setHasMore(couponSnapshot.docs.length === (debouncedSearchTerm ? COUPONS_PER_PAGE * 5 : COUPONS_PER_PAGE) && enrichedCoupons.length > 0);
        }
      } catch (err) {
        console.error("Error fetching coupons:", err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load coupons.");
          setHasMore(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInitialOrSearchCoupons();

    return () => {
      isMounted = false;
    };
  }, [debouncedSearchTerm]);

  const handleLoadMore = React.useCallback(async () => {
    let isMounted = true;
    if (loadingMore || !hasMore || !lastVisibleRef.current || debouncedSearchTerm) {
      // Disable "Load More" when a search term is active, as client-side filtering complicates pagination.
      // User should clear search to paginate all results.
      if (debouncedSearchTerm) {
         setError("Clear search to load more items, or refine your search.");
      }
      return;
    }


    setLoadingMore(true);
    setError(null);

    if (!db) {
      if (isMounted) {
        setError("Database connection not available.");
        setLoadingMore(false);
      }
      return;
    }

    try {
      const couponsCollection = collection(db, 'coupons');
      const constraints = [
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisibleRef.current),
        limit(COUPONS_PER_PAGE)
      ];

      const q = query(couponsCollection, ...constraints);
      const couponSnapshot = await getDocs(q);

      const fetchedCoupons = couponSnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        expiryDate: safeToDate(docSnap.data().expiryDate),
        createdAt: safeToDate(docSnap.data().createdAt),
        updatedAt: safeToDate(docSnap.data().updatedAt),
      } as Coupon));

      const enrichedCoupons = await enrichCouponsWithStoreData(fetchedCoupons);

      if (isMounted) {
        setCoupons(prevCoupons => [...prevCoupons, ...enrichedCoupons]);
        lastVisibleRef.current = couponSnapshot.docs[couponSnapshot.docs.length - 1] || null;
        setHasMore(enrichedCoupons.length === COUPONS_PER_PAGE);
      }
    } catch (err) {
      console.error("Error loading more coupons:", err);
      if (isMounted) {
        setError(err instanceof Error ? err.message : "Failed to load more coupons.");
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        setLoadingMore(false);
      }
    }
    return () => { // Cleanup
      isMounted = false;
    };
  }, [loadingMore, hasMore, debouncedSearchTerm]);

  const showSkeleton = loading && coupons.length === 0 && !error;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <Tag className="w-8 h-8 text-primary" /> Top Coupons & Offers
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
        Find the latest discount codes, deals, and offers from your favorite online stores.
      </p>

       <Card className="max-w-xl mx-auto shadow-sm border sticky top-[calc(var(--header-height,64px)+1rem)] z-40 bg-background/95 backdrop-blur-sm">
           <CardHeader className="pb-4 pt-4">
               <CardTitle className="text-lg">Search Coupons</CardTitle>
               <CardDescription>Search by description or store name.</CardDescription>
           </CardHeader>
           <CardContent className="pb-4">
               <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                       type="search"
                       placeholder="e.g., '10% off electronics' or 'Amazon'"
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="pl-10 h-10"
                       aria-label="Search coupons"
                   />
               </div>
                {debouncedSearchTerm &&
                  <p className="text-xs text-muted-foreground mt-2 pl-1">
                    Showing results for "{debouncedSearchTerm}". Clear search to see all.
                  </p>
                }
           </CardContent>
       </Card>

      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Coupons</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {showSkeleton ? (
          Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={`skel-${index}`} className="h-40 rounded-lg" />
          ))
        ) : coupons.length === 0 && !loading ? (
            <div className="col-span-full text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
                <p className="text-xl mb-4">No coupons found {debouncedSearchTerm ? `matching "${debouncedSearchTerm}"` : ''}.</p>
                <p>Try a different search term or check back later!</p>
            </div>
        ) : (
          coupons.map((coupon) => (
            <CouponCard key={coupon.id} coupon={coupon} />
          ))
        )}
      </div>

      {hasMore && !loading && !debouncedSearchTerm && (
        <div className="mt-8 text-center">
          <Button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load More Coupons
          </Button>
        </div>
      )}
       {debouncedSearchTerm && !loading && coupons.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            Further pagination is disabled while searching. Clear search to see all items.
          </p>
        )}
    </div>
  );
}

    