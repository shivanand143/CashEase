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
  doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, Coupon } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import StoreCard from '@/components/store-card';
import CouponCard from '@/components/coupon-card';
import { AlertCircle, Search } from 'lucide-react';

const SEARCH_LIMIT = 12; // Limit results per type

// Helper type for combining Coupon and Store data
interface CouponWithStore extends Coupon {
  store?: Store; // Optional nested store data
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const queryParam = searchParams.get('q');

  const [searchTerm, setSearchTerm] = React.useState(queryParam || '');
  const [stores, setStores] = React.useState<Store[]>([]);
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [executedSearch, setExecutedSearch] = React.useState(queryParam || ''); // Track executed search

  React.useEffect(() => {
    const performSearch = async (term: string) => {
      if (!term) {
        setStores([]);
        setCoupons([]);
        setLoading(false);
        setError("Please enter a search term.");
        return;
      }

      setLoading(true);
      setError(null);
      setStores([]); // Clear previous results
      setCoupons([]); // Clear previous results
      setExecutedSearch(term); // Update executed search term

      if (!db) {
        setError("Database connection not available.");
        setLoading(false);
        return;
      }

      const lowerTerm = term.toLowerCase(); // For client-side filtering if needed

      try {
        // --- Search Stores ---
        const storesCollection = collection(db, 'stores');
        // Basic name search (case-sensitive prefix search in Firestore)
        const storeQuery = query(
          storesCollection,
          where('isActive', '==', true),
          where('name', '>=', term), // Use original term for potential case-sensitive index
          where('name', '<=', term + '\uf8ff'),
          limit(SEARCH_LIMIT)
        );
        const storeSnap = await getDocs(storeQuery);
        let fetchedStores = storeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Store));

        // Optional: Add client-side filtering for broader matching (if Firestore search is too strict)
        // fetchedStores = fetchedStores.filter(s => s.name.toLowerCase().includes(lowerTerm));

        setStores(fetchedStores);


        // --- Search Coupons ---
        // Searching coupons by description directly is inefficient in Firestore without dedicated indexing/search service.
        // A common approach is to search stores first, then fetch coupons for those stores,
        // OR search coupons based on keywords/description (less efficient).
        // Here, we'll do a basic description search (limited effectiveness).
        const couponsCollection = collection(db, 'coupons');
        const couponQuery = query(
          couponsCollection,
          where('isActive', '==', true),
          // where('description', '>=', term), // Requires indexing or search service
          // where('description', '<=', term + '\uf8ff'),
          orderBy('createdAt', 'desc'), // Order results
          limit(SEARCH_LIMIT * 2) // Fetch more initially to filter client-side
        );
        const couponSnap = await getDocs(couponQuery);
        let fetchedCouponsRaw = couponSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));

        // Client-side filtering for description
         fetchedCouponsRaw = fetchedCouponsRaw.filter(c => c.description.toLowerCase().includes(lowerTerm));
         fetchedCouponsRaw = fetchedCouponsRaw.slice(0, SEARCH_LIMIT); // Apply limit after filtering


        // Enrich coupons with store data
        const enrichedCoupons: CouponWithStore[] = [];
        if (fetchedCouponsRaw.length > 0) {
           const storeCache = new Map<string, Store>();
           // Pre-populate cache with stores found earlier
           fetchedStores.forEach(s => storeCache.set(s.id, s));

           const couponPromises = fetchedCouponsRaw.map(async (coupon) => {
             if (!coupon.storeId) return coupon;
             let storeData = storeCache.get(coupon.storeId);
             if (!storeData) {
               try {
                 const storeDocRef = doc(db, 'stores', coupon.storeId);
                 const storeDocSnap = await getDoc(storeDocRef);
                 if (storeDocSnap.exists()) {
                   storeData = { id: storeDocSnap.id, ...storeDocSnap.data() } as Store;
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
        setError(err instanceof Error ? err.message : "Failed to perform search.");
      } finally {
        setLoading(false);
      }
    };

    if (queryParam) {
       performSearch(queryParam);
    } else {
        setLoading(false); // No initial search term
        setError("Please enter a search term in the header search bar.");
    }
  }, [queryParam]); // Rerun only when queryParam changes

  const hasResults = stores.length > 0 || coupons.length > 0;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
        <Search className="w-8 h-8 text-primary" /> Search Results for "{executedSearch || queryParam}"
      </h1>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Search Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <SearchSkeleton />
      ) : !hasResults && executedSearch ? (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg">
          <p className="text-xl mb-4">No results found for "{executedSearch}".</p>
          <p>Try searching for a different store or offer.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Store Results */}
          {stores.length > 0 && (
            <section>
              <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Matching Stores</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {stores.map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
              </div>
            </section>
          )}

          {/* Coupon Results */}
          {coupons.length > 0 && (
            <section>
              <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Matching Coupons & Deals</h2>
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
       <Skeleton className="h-10 w-1/2" /> {/* Title Skeleton */}

      {/* Stores Skeleton */}
      <section>
        <Skeleton className="h-8 w-1/3 mb-4" /> {/* Section Title Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-lg" />
          ))}
        </div>
      </section>

      {/* Coupons Skeleton */}
       <section>
        <Skeleton className="h-8 w-1/3 mb-4" /> {/* Section Title Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
