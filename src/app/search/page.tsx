// src/app/search/page.tsx
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
import StoreCard from '@/components/store-card'; // Corrected import path
import CouponCard from '@/components/coupon-card';
import { AlertCircle, Search, ShoppingBag, Tag } from 'lucide-react';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast'; // Import useToast

const SEARCH_LIMIT = 12;

interface CouponWithStore extends Coupon {
  store?: Store;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const queryParam = searchParams.get('q');
  const { toast } = useToast(); // Initialize toast

  const [searchTerm, setSearchTerm] = React.useState(queryParam || '');
  const [stores, setStores] = React.useState<Store[]>([]);
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null); // Renamed for clarity
  const [executedSearch, setExecutedSearch] = React.useState(queryParam || '');

  React.useEffect(() => {
    const performSearch = async (term: string) => {
      if (!term) {
        setStores([]);
        setCoupons([]);
        setLoading(false);
        setPageError("Please enter a search term.");
        return;
      }

      setLoading(true);
      setPageError(null);
      setStores([]);
      setCoupons([]);
      setExecutedSearch(term);

      if (firebaseInitializationError) {
          setPageError(`Database initialization failed: ${firebaseInitializationError}`);
          setLoading(false);
          return;
      }
      if (!db) {
        setPageError("Database connection not available.");
        setLoading(false);
        return;
      }

      const lowerTerm = term.toLowerCase();

      try {
        // --- Search Stores ---
        const storesCollection = collection(db, 'stores');
        const storeNameConstraints: QueryConstraint[] = [
          where('isActive', '==', true),
          orderBy('name'), // Order by name for range queries
          where('name', '>=', term), // Case-sensitive prefix
          where('name', '<=', term + '\uf8ff'),
          limit(SEARCH_LIMIT)
        ];
        // Consider adding search for description if needed, but it might require different indexing or client-side filtering
        
        const storeQuery = query(storesCollection, ...storeNameConstraints);
        const storeSnap = await getDocs(storeQuery);
        let fetchedStores = storeSnap.docs.map(d => ({
            id: d.id, ...d.data(),
            createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
            updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
        } as Store));
        
        // Simple client-side filter for case-insensitivity on name if results are few
        // This is not scalable for large datasets but can improve UX for smaller ones.
        fetchedStores = fetchedStores.filter(s => s.name.toLowerCase().includes(lowerTerm));
        
        setStores(fetchedStores);

        // --- Search Coupons ---
        const couponsCollection = collection(db, 'coupons');
        const couponQuery = query(
          couponsCollection,
          where('isActive', '==', true),
          orderBy('description'), // Order by description for range queries
          where('description', '>=', term),
          where('description', '<=', term + '\uf8ff'),
          limit(SEARCH_LIMIT)
        );
        const couponSnap = await getDocs(couponQuery);
        let fetchedCouponsRaw = couponSnap.docs.map(d => ({
            id: d.id, ...d.data(),
            expiryDate: safeToDate(d.data().expiryDate as Timestamp | undefined),
            createdAt: safeToDate(d.data().createdAt as Timestamp | undefined),
            updatedAt: safeToDate(d.data().updatedAt as Timestamp | undefined),
        } as Coupon));

        // Client-side filter for case-insensitivity on description
        fetchedCouponsRaw = fetchedCouponsRaw.filter(c => c.description.toLowerCase().includes(lowerTerm));

        // Enrich coupons with store data
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
                   } as Store;
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
        setCoupons(enrichedCoupons);

      } catch (err) {
        console.error("Error performing search:", err);
        setPageError(err instanceof Error ? err.message : "Failed to perform search.");
      } finally {
        setLoading(false);
      }
    };

    if (queryParam) {
       performSearch(queryParam);
    } else {
        setLoading(false);
        setPageError("Please enter a search term in the header search bar or on the homepage.");
    }
  }, [queryParam]);

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

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
        <Search className="w-8 h-8 text-primary" /> Search Results for "{executedSearch || queryParam}"
      </h1>

      {pageError && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Search Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <SearchSkeleton />
      ) : !hasResults && executedSearch ? (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
          <p className="text-xl mb-4">No results found for "{executedSearch}".</p>
          <p>Try searching for a different store or offer.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {stores.length > 0 && (
            <section>
              <h2 className="text-2xl font-semibold mb-4 border-b pb-2 flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-primary" /> Matching Stores
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
                <Tag className="w-6 h-6 text-primary" /> Matching Coupons & Deals
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {coupons.map((coupon) => (
                  <CouponCard key={coupon.id} coupon={coupon} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// Skeleton Loader Component
function SearchSkeleton() {
  return (
    <div className="space-y-10">
       <Skeleton className="h-10 w-1/2" />

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
  );
}
