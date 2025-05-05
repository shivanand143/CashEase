
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
  DocumentData
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import StoreCard from '@/components/store-card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Search, Store as StoreIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce'; // Corrected import path

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
    if (!loadMore) {
      setLoading(true);
      setLastVisible(null);
      setStores([]);
      setHasMore(true); // Reset hasMore on new search/initial load
    } else {
      setLoadingMore(true);
    }
    setError(null);

    if (!db) {
      setError("Database connection not available.");
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    try {
      const storesCollection = collection(db, 'stores');
      const constraints = [
        where('isActive', '==', true),
        orderBy('name', 'asc') // Always order by name
      ];

      // Basic name search (case-sensitive in Firestore by default)
      if (search) {
         // Simple prefix search. For full-text, consider Algolia or other services.
         // This requires indexing the 'name' field.
         constraints.push(where('name', '>=', search));
         constraints.push(where('name', '<=', search + '\uf8ff'));
      }

      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(STORES_PER_PAGE));

      const q = query(storesCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const storesData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as Store));

      if (loadMore) {
        setStores(prev => [...prev, ...storesData]);
      } else {
        setStores(storesData);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === STORES_PER_PAGE);

    } catch (err) {
      console.error("Error fetching stores:", err);
      setError(err instanceof Error ? err.message : "Failed to load stores.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [lastVisible]);

  // Fetch stores on initial load and when debounced search term changes
  React.useEffect(() => {
    fetchStores(false, debouncedSearchTerm);
  }, [fetchStores, debouncedSearchTerm]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchStores(true, debouncedSearchTerm);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <StoreIcon className="w-8 h-8 text-primary" /> All Stores
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
        Browse all our partner stores offering cashback and deals. Click on a store to see specific offers.
      </p>

      {/* Search Input */}
       <Card className="max-w-xl mx-auto shadow-sm border">
           <CardHeader className="pb-4">
               <CardTitle className="text-lg">Search Stores</CardTitle>
           </CardHeader>
           <CardContent>
               <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                       type="search"
                       placeholder="Search by store name..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="pl-10 h-10"
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

      {loading && stores.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg">
          <p className="text-xl mb-4">No stores found {searchTerm ? `matching "${searchTerm}"` : ''}.</p>
          <p>Try adjusting your search or check back later!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}

      {hasMore && (
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
