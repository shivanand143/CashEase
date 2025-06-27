"use client";

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  QueryConstraint,
  Timestamp
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Store, Coupon } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import StoreCard from '@/components/store-card';
import CouponCard from '@/components/coupon-card';
import { AlertCircle, Search as SearchIconLucide, ShoppingBag, Tag } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export const dynamic = 'force-dynamic';
const SEARCH_LIMIT = 12;

interface CouponWithStore extends Coupon {
  store?: Store;
}

function SearchPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-3/4 md:w-1/2" /> {/* Title */}
      <div className="space-y-10">
        <section>
          <Skeleton className="h-8 w-1/3 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`store-skel-${index}`} className="h-48 rounded-lg" />
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="h-8 w-1/3 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const queryParam = searchParams?.get('q'); // Safely access get
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = React.useState(queryParam || '');
  const [stores, setStores] = React.useState<Store[]>([]);
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [executedSearch, setExecutedSearch] = React.useState(queryParam || '');

  React.useEffect(() => {
    // Update searchTerm if queryParam from URL changes
    const newQueryParam = searchParams?.get('q');
    setSearchTerm(newQueryParam || '');
    setExecutedSearch(newQueryParam || ''); // Also update executedSearch to reflect current search
  }, [searchParams]);

  React.useEffect(() => {
    let isMounted = true;
    const performSearch = async (term: string) => {
      if (!isMounted) return;
      if (!term.trim()) { // Check if term is empty or just whitespace
        if (isMounted) {
          setStores([]);
          setCoupons([]);
          setLoading(false);
          setExecutedSearch(''); // Clear executed search if term is empty
          setPageError(null); // Clear any previous errors
        }
        return;
      }

      setLoading(true);
      setPageError(null);
      setStores([]);
      setCoupons([]);
      // setExecutedSearch(term); // Moved to the effect above that listens to searchParams

      if (firebaseInitializationError) {
          if(isMounted) setPageError(`Database initialization failed: ${firebaseInitializationError}`);
          if(isMounted) setLoading(false);
          return;
      }
      if (!db) {
        if(isMounted) setPageError("Database connection not available.");
        if(isMounted) setLoading(false);
        return;
      }

      const lowerTerm = term.toLowerCase();

      try {
        // Search Stores
        const storesCollection = collection(db, 'stores');
        // Firestore SDK doesn't directly support case-insensitive 'contains' queries.
        // A common workaround is to query for a range and then filter client-side.
        // Or, use a third-party search service like Algolia for better search capabilities.
        // This query fetches stores whose names start with the search term (case-sensitive).
        const storeNameConstraints: QueryConstraint[] = [
          where('isActive', '==', true),
          orderBy('name'),
          where('name', '>=', term),
          where('name', '<=', term + '\uf8ff'), // '\uf8ff' is a high-Unicode character
          limit(SEARCH_LIMIT)
        ];

        const storeQuery = query(storesCollection, ...storeNameConstraints);
        const storeSnap = await getDocs(storeQuery);
        let fetchedStores = storeSnap.docs.map(d => ({
          id: d.id, ...d.data(),
          createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
          updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
        } as unknown as Store));

        // Client-side filter for better "contains" behavior (case-insensitive)
        fetchedStores = fetchedStores.filter(s => s.name.toLowerCase().includes(lowerTerm));
        if(isMounted) setStores(fetchedStores);

        // Search Coupons (by description)
        const couponsCollection = collection(db, 'coupons');
        const couponDescConstraints: QueryConstraint[] = [
          where('isActive', '==', true),
          orderBy('description'),
          where('description', '>=', term),
          where('description', '<=', term + '\uf8ff'),
          limit(SEARCH_LIMIT)
        ];
        const couponQuery = query(couponsCollection, ...couponDescConstraints);
        const couponSnap = await getDocs(couponQuery);
        let fetchedCouponsRaw = couponSnap.docs.map(d => ({
          id: d.id, ...d.data(),
          expiryDate: safeToDate(d.data().expiryDate as Timestamp | undefined),
          createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
          updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
        } as unknown as Coupon));

        fetchedCouponsRaw = fetchedCouponsRaw.filter(c => c.description.toLowerCase().includes(lowerTerm));

        const enrichedCoupons: CouponWithStore[] = [];
        if (fetchedCouponsRaw.length > 0) {
           const storeCache = new Map<string, Store>();
           fetchedStores.forEach(s => storeCache.set(s.id, s)); // Pre-populate cache

           const couponPromises = fetchedCouponsRaw.map(async (coupon) => {
             if (!coupon.storeId) return coupon;
             let storeData = storeCache.get(coupon.storeId);
             if (!storeData && db) {
               try {
                 const storeDocRef = doc(db, 'stores', coupon.storeId);
                 const storeDocSnap = await getDoc(storeDocRef);
                 if (storeDocSnap.exists()) {
                   const rawStoreData = storeDocSnap.data();
                   storeData = {
                     id: storeDocSnap.id, ...rawStoreData,
                     createdAt: safeToDate(rawStoreData.createdAt as Timestamp | undefined),
                     updatedAt: safeToDate(rawStoreData.updatedAt as Timestamp | undefined),
                   } as unknown as Store;
                   storeCache.set(coupon.storeId, storeData);
                 }
               } catch (storeErr) {
                 console.error(`Error fetching store ${coupon.storeId} for coupon ${coupon.id}:`, storeErr);
               }
             }
             return { ...coupon, store: storeData };
           });
           enrichedCoupons.push(...await Promise.all(couponPromises));
        }
        if(isMounted) setCoupons(enrichedCoupons);

      } catch (err) {
        console.error("Error performing search:", err);
        if(isMounted) setPageError(err instanceof Error ? err.message : "Failed to perform search.");
      } finally {
        if(isMounted) setLoading(false);
      }
    };

    performSearch(searchTerm);
    return () => { isMounted = false; };
  }, [searchTerm]); // Rerun search when searchTerm (from URL via the other useEffect) changes

  React.useEffect(() => {
    if (pageError) {
      toast({
        variant: "destructive",
        title: "Search Error",
        description: pageError,
      });
    }
  }, [pageError, toast]);

  const hasResults = stores.length > 0 || coupons.length > 0;

  if (loading && executedSearch) {
    return <SearchPageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
        <SearchIconLucide className="w-8 h-8 text-primary" />
        {executedSearch ? `Search Results for "${executedSearch}"` : "Search"}
      </h1>

      {pageError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Search Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      {!loading && !hasResults && executedSearch && !pageError && (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
          <p className="text-xl mb-4">No results found for "{executedSearch}".</p>
          <p>Try searching for a different store or offer, or check your spelling.</p>
        </div>
      )}
       {!loading && !executedSearch && !pageError && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Please enter a term in the search bar on the homepage or navigation to find stores and coupons.</p>
        </div>
      )}


      {stores.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 border-b pb-2 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-primary" /> Matching Stores ({stores.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        </section>
      )}

      {coupons.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 border-b pb-2 flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" /> Matching Coupons & Deals ({coupons.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
