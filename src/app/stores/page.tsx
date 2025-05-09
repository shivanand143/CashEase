// src/app/stores/page.tsx
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
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import StoreCard from '@/components/store-card'; // Corrected import path
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Search, Store as StoreIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast'; // Import useToast

const STORES_PER_PAGE = 24;

export default function StoresPage() {
  const [stores, setStores] = React.useState<Store[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [pageError, setPageError] = React.useState<string | null>(null); // Renamed for clarity
  const lastVisibleRef = React.useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const { toast } = useToast(); // Initialize toast

  React.useEffect(() => {
    let isMounted = true;
    const fetchInitialOrSearchStores = async () => {
      if (!isMounted) return;

      setLoading(true);
      setPageError(null);
      setStores([]);
      lastVisibleRef.current = null;
      setHasMore(true);

      if (firebaseInitializationError) {
          if(isMounted) {
            setPageError(`Database initialization failed: ${firebaseInitializationError}`);
            setLoading(false);
            setHasMore(false);
          }
          return;
      }
      if (!db) {
        if (isMounted) {
          setPageError("Database connection not available.");
          setLoading(false);
          setHasMore(false);
        }
        return;
      }

      try {
        const storesCollection = collection(db, 'stores');
        let constraints = [
          where('isActive', '==', true),
          orderBy('name', 'asc')
        ];

        if (debouncedSearchTerm) {
          // Firestore requires the first orderBy field to be the same as the where field for range/inequality filters
          constraints = [
            where('isActive', '==', true),
            where('name', '>=', debouncedSearchTerm),
            where('name', '<=', debouncedSearchTerm + '\uf8ff'),
            orderBy('name', 'asc'), // Ensure this matches the inequality filter field
          ];
        }
        constraints.push(limit(STORES_PER_PAGE));

        const q = query(storesCollection, ...constraints);
        const querySnapshot = await getDocs(q);

        const storesData = querySnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined),
          updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined),
        } as Store));

        if (isMounted) {
          setStores(storesData);
          lastVisibleRef.current = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
          setHasMore(storesData.length === STORES_PER_PAGE);
        }
      } catch (err) {
        console.error("Error fetching stores:", err);
        if (isMounted) {
          setPageError(err instanceof Error ? err.message : "Failed to load stores.");
          setHasMore(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInitialOrSearchStores();

    return () => {
      isMounted = false;
    };
  }, [debouncedSearchTerm]);

  const handleLoadMore = React.useCallback(async () => {
    let isMounted = true;
    if (loadingMore || !hasMore || !lastVisibleRef.current || !db || firebaseInitializationError) {
        if (firebaseInitializationError && isMounted) setPageError(`Database initialization failed: ${firebaseInitializationError}`);
        else if (!db && isMounted) setPageError("Database not available for loading more.");
        return;
    }


    setLoadingMore(true);
    setPageError(null);

    try {
      const storesCollection = collection(db, 'stores');
      let constraints = [
        where('isActive', '==', true),
        orderBy('name', 'asc'),
        startAfter(lastVisibleRef.current)
      ];

      if (debouncedSearchTerm) {
         constraints = [ // Re-define constraints for search load more
            where('isActive', '==', true),
            where('name', '>=', debouncedSearchTerm),
            where('name', '<=', debouncedSearchTerm + '\uf8ff'),
            orderBy('name', 'asc'),
            startAfter(lastVisibleRef.current),
          ];
      }
      constraints.push(limit(STORES_PER_PAGE));

      const q = query(storesCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const storesData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined),
        updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined),
      } as Store));

      if (isMounted) {
        setStores(prevStores => [...prevStores, ...storesData]);
        lastVisibleRef.current = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        setHasMore(storesData.length === STORES_PER_PAGE);
      }
    } catch (err) {
      console.error("Error loading more stores:", err);
      if (isMounted) {
        setPageError(err instanceof Error ? err.message : "Failed to load more stores.");
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        setLoadingMore(false);
      }
    }
    return () => {
      isMounted = false;
    };
  }, [loadingMore, hasMore, debouncedSearchTerm]);


  React.useEffect(() => {
    if (pageError) {
      toast({
        variant: "destructive",
        title: "Error",
        description: pageError,
      });
    }
  }, [pageError, toast]);

  const showSkeleton = loading && stores.length === 0 && !pageError;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <StoreIcon className="w-8 h-8 text-primary" /> All Stores
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
        Browse all our partner stores offering cashback and deals. Click on a store to see specific offers.
      </p>

       <Card className="max-w-xl mx-auto shadow-sm border sticky top-[calc(var(--header-height,64px)+1rem)] z-40 bg-background/95 backdrop-blur-sm">
           <CardHeader className="pb-4 pt-4">
               <CardTitle className="text-lg">Search Stores</CardTitle>
           </CardHeader>
           <CardContent className="pb-4">
               <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                       type="search"
                       placeholder="Search by store name..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="pl-10 h-10"
                       aria-label="Search stores"
                   />
               </div>
           </CardContent>
       </Card>

      {pageError && !loading && ( // Display general error if not initial loading
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Stores</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {showSkeleton ? (
          Array.from({ length: STORES_PER_PAGE }).map((_, index) => (
            <Skeleton key={`skel-${index}`} className="h-48 rounded-lg" />
          ))
        ) : stores.length === 0 && !loading ? ( // Condition for no results
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

      {hasMore && !loading && ( // Condition for load more button
        <div className="mt-8 text-center">
          <Button onClick={handleLoadMore} disabled={loadingMore || !!firebaseInitializationError}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load More Stores
          </Button>
        </div>
      )}
    </div>
  );
}
