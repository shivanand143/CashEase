
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
  doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import CouponCard from '@/components/coupon-card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Tag, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce'; // Corrected import path

const COUPONS_PER_PAGE = 18; // Adjust as needed

// Helper type for combining Coupon and Store data
interface CouponWithStore extends Coupon {
  store?: Store; // Optional nested store data
}

export default function CouponsPage() {
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search input


  // --- Helper function to fetch coupons and enrich with store data ---
  const fetchCouponsWithStoreData = React.useCallback(async (
    loadMore = false,
    search = ''
  ): Promise<{ data: CouponWithStore[]; newLastVisible: QueryDocumentSnapshot<DocumentData> | null; newHasMore: boolean }> => {

    let fetchedCoupons: Coupon[] = [];
    let enrichedCoupons: CouponWithStore[] = [];
    let newLastVisible: QueryDocumentSnapshot<DocumentData> | null = loadMore ? lastVisible : null;
    let newHasMore = true;

    if (!db) {
      throw new Error("Database connection not available.");
    }

    try {
      const couponsCollection = collection(db, 'coupons');
      const constraints = [
        where('isActive', '==', true),
        // orderBy('isFeatured', 'desc'), // Prioritize featured coupons
        orderBy('createdAt', 'desc') // Fallback sort
      ];

      // Basic search by description (requires indexing description or using a search service like Algolia)
       // Note: Firestore's native search capabilities are limited here.
       // This is a basic implementation; might be slow or inaccurate on large datasets without proper indexing or external search service.
      if (search) {
         // constraints.push(where('description', '>=', search));
         // constraints.push(where('description', '<=', search + '\uf8ff'));
         console.warn("Coupon description search is limited. Consider searching by store or using a dedicated search service.");
      }


      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(COUPONS_PER_PAGE));

      const q = query(couponsCollection, ...constraints);
      const couponSnapshot = await getDocs(q);

       fetchedCoupons = couponSnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as Coupon));

      // Apply client-side filtering for description search if needed
       if (search) {
           const lowerSearch = search.toLowerCase();
           fetchedCoupons = fetchedCoupons.filter(c => c.description.toLowerCase().includes(lowerSearch));
       }


      // Fetch Store data for each coupon
      if (fetchedCoupons.length > 0) {
        const storeCache = new Map<string, Store>(); // Cache to avoid refetching same store
        const storePromises = fetchedCoupons.map(async (coupon) => {
          if (!coupon.storeId) return coupon;

          // Check cache first
          if (storeCache.has(coupon.storeId)) {
            return { ...coupon, store: storeCache.get(coupon.storeId) };
          }

          try {
            const storeDocRef = doc(db, 'stores', coupon.storeId);
            const storeSnap = await getDoc(storeDocRef);
            if (storeSnap.exists()) {
              const storeData = { id: storeSnap.id, ...storeSnap.data() } as Store;
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

       newLastVisible = couponSnapshot.docs[couponSnapshot.docs.length - 1] || null;
       // Determine hasMore based on the original fetch limit, *before* client-side filtering
       newHasMore = couponSnapshot.docs.length === COUPONS_PER_PAGE;


    } catch (err) {
      console.error(`Error fetching coupons:`, err);
      throw err; // Re-throw error to be caught by the calling function
    }

    return { data: enrichedCoupons, newLastVisible, newHasMore };
  }, [lastVisible]); // Include lastVisible in dependencies

 // Fetch coupons function wrapped for useEffect
 const fetchInitialOrSearchCoupons = React.useCallback(async (search: string) => {
     setLoading(true);
     setError(null);
     try {
       const { data, newLastVisible, newHasMore } = await fetchCouponsWithStoreData(false, search);
       setCoupons(data);
       setLastVisible(newLastVisible);
       setHasMore(newHasMore);
     } catch (err) {
       setError(err instanceof Error ? err.message : "Failed to load coupons.");
     } finally {
       setLoading(false);
     }
   }, [fetchCouponsWithStoreData]); // fetchCouponsWithStoreData has its own deps

   // Load more coupons function
   const handleLoadMore = React.useCallback(async () => {
     if (loadingMore || !hasMore || !lastVisible) return;
     setLoadingMore(true);
     setError(null);
     try {
       const { data, newLastVisible, newHasMore } = await fetchCouponsWithStoreData(true, debouncedSearchTerm);
       setCoupons(prev => [...prev, ...data]);
       setLastVisible(newLastVisible);
       setHasMore(newHasMore);
     } catch (err) {
       setError(err instanceof Error ? err.message : "Failed to load more coupons.");
     } finally {
       setLoadingMore(false);
     }
   }, [loadingMore, hasMore, lastVisible, debouncedSearchTerm, fetchCouponsWithStoreData]);


  // Effect for initial load and search term changes
  React.useEffect(() => {
    fetchInitialOrSearchCoupons(debouncedSearchTerm);
  }, [debouncedSearchTerm, fetchInitialOrSearchCoupons]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <Tag className="w-8 h-8 text-primary" /> Top Coupons & Offers
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
        Find the latest discount codes, deals, and offers from your favorite online stores.
      </p>

       {/* Search Input */}
       <Card className="max-w-xl mx-auto shadow-sm border">
           <CardHeader className="pb-4">
               <CardTitle className="text-lg">Search Coupons</CardTitle>
           </CardHeader>
           <CardContent>
               <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                       type="search"
                       placeholder="Search by coupon description (e.g., '10% off', 'free shipping')..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="pl-10 h-10"
                   />
               </div>
                 <p className="text-xs text-muted-foreground mt-2 pl-1">Note: Search functionality might be limited.</p>
           </CardContent>
       </Card>

      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Coupons</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && coupons.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg">
          <p className="text-xl mb-4">No coupons found {searchTerm ? `matching "${searchTerm}"` : ''}.</p>
          <p>Try broadening your search or check back later!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {coupons.map((coupon) => (
             // Ensure store data is passed if available
            <CouponCard key={coupon.id} coupon={coupon} />
          ))}
        </div>
      )}

      {hasMore && (
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
