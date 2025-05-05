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
import CouponCard from '@/components/coupon-card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Tag, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate } from '@/lib/utils';

const COUPONS_PER_PAGE = 18; // Adjust as needed

export default function CouponsPage() {
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search input

  // Fetch coupons with store data - Stable function reference
  const fetchCouponsWithStoreData = React.useCallback(async (
    loadMore = false,
    search = '',
    currentLastVisible: QueryDocumentSnapshot<DocumentData> | null
  ): Promise<{ data: CouponWithStore[]; newLastVisible: QueryDocumentSnapshot<DocumentData> | null; newHasMore: boolean }> => {

    let fetchedCoupons: Coupon[] = [];
    let enrichedCoupons: CouponWithStore[] = [];
    let newLastVisible: QueryDocumentSnapshot<DocumentData> | null = currentLastVisible;
    let newHasMore = true;

    if (!db) {
      throw new Error("Database connection not available.");
    }

    try {
      const couponsCollection = collection(db, 'coupons');
      // Base constraints
      const constraints = [
        where('isActive', '==', true),
        orderBy('createdAt', 'desc') // Primary sort
        // Consider adding orderBy('isFeatured', 'desc') if you want featured first *always*
        // Note: Complex ordering might require additional composite indexes
      ];

      // Add pagination if loading more
      if (loadMore && currentLastVisible) {
        constraints.push(startAfter(currentLastVisible));
      }
      constraints.push(limit(COUPONS_PER_PAGE));

      const q = query(couponsCollection, ...constraints);
      const couponSnapshot = await getDocs(q);

      fetchedCoupons = couponSnapshot.docs.map(docSnap => {
         const data = docSnap.data();
         return {
            id: docSnap.id,
            ...data,
            // Convert timestamps proactively
            expiryDate: safeToDate(data.expiryDate),
            createdAt: safeToDate(data.createdAt),
            updatedAt: safeToDate(data.updatedAt),
         } as Coupon;
      });

      // --- Client-side filtering for description search ---
      // This is necessary because Firestore doesn't efficiently support 'contains' text search.
      // For large datasets, a dedicated search service (Algolia, Typesense) is recommended.
      let filteredCoupons = fetchedCoupons;
      if (search) {
           const lowerSearch = search.toLowerCase();
           console.log(`Client-side filtering for term: "${lowerSearch}"`);
           filteredCoupons = fetchedCoupons.filter(c =>
               c.description.toLowerCase().includes(lowerSearch)
           );
           console.log(`Found ${filteredCoupons.length} matches after client-side filter.`);
      }
      // --- End Client-side filtering ---


      // Fetch Store data for each *filtered* coupon
      if (filteredCoupons.length > 0) {
        const storeCache = new Map<string, Store>(); // Cache to avoid refetching same store
        const storePromises = filteredCoupons.map(async (coupon) => {
          if (!coupon.storeId) return coupon; // Return coupon as is if no storeId
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
              storeCache.set(coupon.storeId, storeData); // Add to cache
              return { ...coupon, store: storeData };
            }
            return coupon; // Store not found
          } catch (storeError) {
            console.error(`Error fetching store ${coupon.storeId} for coupon ${coupon.id}:`, storeError);
            return coupon; // Return coupon even if store fetch fails
          }
        });
        enrichedCoupons = await Promise.all(storePromises);
      }

      // Update lastVisible based on the *original Firestore snapshot*, not the filtered results
      newLastVisible = couponSnapshot.docs[couponSnapshot.docs.length - 1] || null;
      // Determine hasMore based on the *original Firestore fetch limit*
      newHasMore = couponSnapshot.docs.length === COUPONS_PER_PAGE;

    } catch (err) {
      console.error(`Error fetching coupons:`, err);
      throw err; // Re-throw error to be caught by the calling function
    }

    return { data: enrichedCoupons, newLastVisible, newHasMore };
  }, []); // Empty dependency array as it relies on passed args

 // Effect for initial load and search term changes
 React.useEffect(() => {
    let isMounted = true; // Flag to prevent state updates if unmounted
    const fetchInitialOrSearch = async () => {
        console.log(`Fetching initial/search coupons for term: "${debouncedSearchTerm}"`);
        setLoading(true);
        setError(null);
        setLastVisible(null); // Reset pagination for new search
        setCoupons([]); // Clear existing coupons
        setHasMore(true); // Assume more initially

        try {
            const { data, newLastVisible, newHasMore } = await fetchCouponsWithStoreData(false, debouncedSearchTerm, null);
            if (isMounted) {
                setCoupons(data);
                setLastVisible(newLastVisible);
                setHasMore(newHasMore);
            }
        } catch (err) {
            if (isMounted) {
                setError(err instanceof Error ? err.message : "Failed to load coupons.");
                setHasMore(false); // Stop loading on error
            }
        } finally {
            if (isMounted) {
                setLoading(false);
            }
        }
    };

    fetchInitialOrSearch();

    return () => { isMounted = false }; // Cleanup function
 }, [debouncedSearchTerm, fetchCouponsWithStoreData]); // Re-run only when debounced term or fetch function changes


  // Load more coupons function
  const handleLoadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore || !lastVisible) return; // Prevent multiple calls or loading when no more data
    let isMounted = true;
    console.log("Loading more coupons...");
    setLoadingMore(true);
    setError(null);

    try {
        // Pass the current lastVisible document snapshot
        const { data, newLastVisible, newHasMore } = await fetchCouponsWithStoreData(true, debouncedSearchTerm, lastVisible);
        if (isMounted) {
            setCoupons(prev => [...prev, ...data]);
            setLastVisible(newLastVisible);
            setHasMore(newHasMore);
        }
    } catch (err) {
        if (isMounted) {
            setError(err instanceof Error ? err.message : "Failed to load more coupons.");
            setHasMore(false); // Stop trying if load more fails
        }
    } finally {
        if (isMounted) {
            setLoadingMore(false);
        }
    }
    return () => { isMounted = false }; // Cleanup function
  }, [loadingMore, hasMore, lastVisible, debouncedSearchTerm, fetchCouponsWithStoreData]);


  const showSkeleton = loading && coupons.length === 0 && !error;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <Tag className="w-8 h-8 text-primary" /> Top Coupons & Offers
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
        Find the latest discount codes, deals, and offers from your favorite online stores.
      </p>

       {/* Search Input Card */}
       <Card className="max-w-xl mx-auto shadow-sm border sticky top-20 z-40 bg-background/95 backdrop-blur-sm">
           <CardHeader className="pb-4 pt-4">
               <CardTitle className="text-lg">Search Coupons</CardTitle>
           </CardHeader>
           <CardContent className="pb-4">
               <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                       type="search"
                       placeholder="Search by coupon description (e.g., '10% off')..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="pl-10 h-10"
                       aria-label="Search coupons"
                   />
               </div>
                <p className="text-xs text-muted-foreground mt-2 pl-1">Note: Search may take a moment to update.</p>
           </CardContent>
       </Card>

      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Coupons</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Grid for Coupons or Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {showSkeleton ? (
          Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={`skel-${index}`} className="h-40 rounded-lg" />
          ))
        ) : coupons.length === 0 && !loading ? ( // Show 'No results' only after loading
            <div className="col-span-full text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
                <p className="text-xl mb-4">No coupons found {debouncedSearchTerm ? `matching "${debouncedSearchTerm}"` : ''}.</p>
                <p>Try broadening your search or check back later!</p>
            </div>
        ) : (
          coupons.map((coupon) => (
             // Ensure store data is passed if available
            <CouponCard key={coupon.id} coupon={coupon} />
          ))
        )}
      </div>

      {/* Load More Button */}
      {hasMore && !loading && ( // Show only if more data exists and not initial loading
        <div className="mt-8 text-center">
          <Button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load More Coupons
          </Button>
        </div>
      )}
    </div>
  );
}
