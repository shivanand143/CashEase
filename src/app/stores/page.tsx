
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
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import StoreCard from '@/components/store-card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Search, Store as StoreIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate } from '@/lib/utils';

const STORES_PER_PAGE = 24; // Adjust as needed

export default function StoresPage() {
  const [stores, setStores] = React.useState<Store[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Debounce search input

  const fetchStores = React.useCallback(async (loadMore = false, search = '') => {
    // Determine if this is an initial load or a search/filter action
    const isInitialOrNewSearch = !loadMore;

    if (isInitialOrNewSearch) {
      setLoading(true);
      setLastVisible(null); // Reset pagination for new search/initial load
      setStores([]); // Clear existing data
      setHasMore(true); // Assume there's more until the first fetch proves otherwise
    } else {
      setLoadingMore(true);
    }
    setError(null);

    if (!db) {
      setError("Database connection not available.");
      setLoading(isInitialOrNewSearch);
      setLoadingMore(false);
      return;
    }

    try {
      const storesCollection = collection(db, 'stores');
      const constraints = [
        where('isActive', '==', true),
        orderBy('name', 'asc') // Consistent ordering
      ];

      // Apply search filter if provided
      if (search) {
        // Simple prefix search for name (adjust if full-text needed)
        constraints.push(where('name', '>=', search));
        constraints.push(where('name', '<=', search + '\uf8ff'));
      }

      // Add pagination constraint if loading more
      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(STORES_PER_PAGE));

      const q = query(storesCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const storesData = querySnapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            // Ensure timestamps are Date objects
            createdAt: safeToDate(data.createdAt),
            updatedAt: safeToDate(data.updatedAt),
          } as Store;
      });

      // Update state based on whether it's loading more or a new load
      setStores(prevStores => isInitialOrNewSearch ? storesData : [...prevStores, ...storesData]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(storesData.length === STORES_PER_PAGE);

    } catch (err) {
      console.error("Error fetching stores:", err);
      setError(err instanceof Error ? err.message : "Failed to load stores.");
      // Clear stores only if it was an initial load error
      if(isInitialOrNewSearch) setStores([]);
      setHasMore(false); // Stop further loading attempts on error
    } finally {
        setLoading(false); // Always set main loading false after initial attempt
        setLoadingMore(false); // Always set loading more false
    }
  }, [lastVisible]); // Depend only on lastVisible for pagination logic

  // Effect for initial load and search term changes
  React.useEffect(() => {
    // Trigger fetch only when debounced search term changes
    // The 'loadMore' argument is false here, indicating a new search/initial load
    fetchStores(false, debouncedSearchTerm);
  }, [debouncedSearchTerm, fetchStores]); // Depend on debounced term and the stable fetchStores

  const handleLoadMore = () => {
    // Trigger fetch with 'loadMore' set to true
    // Use the current debounced search term for consistency
    if (!loadingMore && hasMore) {
      fetchStores(true, debouncedSearchTerm);
    }
  };

  // Determine overall loading state for skeleton display
  const showSkeleton = loading && stores.length === 0 && !error;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <StoreIcon className="w-8 h-8 text-primary" /> All Stores
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
        Browse all our partner stores offering cashback and deals. Click on a store to see specific offers.
      </p>

      {/* Search Input Card - Improved Styling */}
       <Card className="max-w-xl mx-auto shadow-sm border sticky top-20 z-40 bg-background/95 backdrop-blur-sm">
           <CardHeader className="pb-4 pt-4"> {/* Reduced padding */}
               <CardTitle className="text-lg">Search Stores</CardTitle>
           </CardHeader>
           <CardContent className="pb-4"> {/* Reduced padding */}
               <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                       type="search"
                       placeholder="Search by store name..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="pl-10 h-10" // Standard height
                       aria-label="Search stores"
                   />
               </div>
           </CardContent>
       </Card>

      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Stores</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Grid for Stores or Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {showSkeleton ? (
          Array.from({ length: STORES_PER_PAGE }).map((_, index) => (
            <Skeleton key={`skel-${index}`} className="h-48 rounded-lg" />
          ))
        ) : stores.length === 0 && !loading ? ( // Show 'No results' only after loading and if stores array is empty
             <div className="col-span-full text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
                <p className="text-xl mb-4">No stores found {debouncedSearchTerm ? `matching "${debouncedSearchTerm}"` : ''}.</p>
                <p>Try adjusting your search or check back later!</p>
             </div>
        ) : (
          stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))
        )}
      </div>

      {/* Load More Button */}
      {hasMore && !loading && ( // Show Load More only if there's more data and not currently loading initial data
        <div className="mt-8 text-center">
          <Button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load More Stores
          </Button>
        </div>
      )}
    </div>
  );
}
