
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
  Timestamp
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import StoreCard from '@/components/store-card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Search, Store as StoreIconLucide } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate } from '@/lib/utils';

const STORES_PER_PAGE = 24;

function StoresPageSkeleton() {
  const STORES_PER_PAGE_SKELETON = 12;
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <StoreIconLucide className="w-12 h-12 text-primary mx-auto" />
        <h1 className="text-3xl md:text-4xl font-bold">All Stores</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Loading stores...</p>
      </div>
      <Card className="max-w-xl mx-auto shadow-sm border">
        <CardHeader className="pb-4 pt-4">
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
        <CardContent className="pb-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {Array.from({ length: STORES_PER_PAGE_SKELETON }).map((_, index) => (
          <Skeleton key={`store-skel-client-${index}`} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function StoresPage() {
  const [stores, setStores] = React.useState<Store[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();

  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  const fetchStores = React.useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    if (!isLoadMoreOperation) setLoading(true);
    else setLoadingMore(true);
    
    setError(null);
    setIsSearching(currentSearchTerm !== '');

    if (firebaseInitializationError) {
      setError(firebaseInitializationError);
      setLoading(false); setLoadingMore(false); setHasMore(false);
      return;
    }
    if (!db) {
      setError("Database connection not available.");
      setLoading(false); setLoadingMore(false); setHasMore(false);
      return;
    }

    try {
      const storesCollection = collection(db, 'stores');
      const constraints: QueryConstraint[] = [
        where('isActive', '==', true),
      ];

      if (currentSearchTerm) {
        constraints.push(orderBy('name'));
        constraints.push(where('name', '>=', currentSearchTerm));
        constraints.push(where('name', '<=', currentSearchTerm + '\uf8ff'));
      } else {
        constraints.push(orderBy('isFeatured', 'desc'));
        constraints.push(orderBy('name', 'asc'));
      }

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(STORES_PER_PAGE));

      const q = query(storesCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const storesData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined),
        updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined),
      } as unknown as Store));

      if (isLoadMoreOperation) {
        setStores(prev => [...prev, ...storesData]);
      } else {
        setStores(storesData);
      }
      const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
      setLastVisible(newLastVisible);
      setHasMore(storesData.length === STORES_PER_PAGE);
    } catch (err) {
      console.error("Error fetching stores:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch stores";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      setHasMore(false);
    } finally {
      if (!isLoadMoreOperation) setLoading(false);
      else setLoadingMore(false);
      setIsSearching(false);
    }
  }, [toast]);


  React.useEffect(() => {
    fetchStores(false, debouncedSearchTerm, null);
  }, [debouncedSearchTerm, fetchStores]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // fetchStores is triggered by debouncedSearchTerm change in useEffect
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchStores(true, debouncedSearchTerm, lastVisible);
    }
  };
  
  if (loading && stores.length === 0 && !error) {
    return <StoresPageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2 flex items-center justify-center gap-3">
          <StoreIconLucide className="w-10 h-10 text-primary" /> All Stores
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Browse all our partner stores. Click on any store to see available coupons, deals, and cashback offers.
        </p>
      </section>

      <Card className="max-w-xl mx-auto shadow-sm border">
        <CardHeader className="pb-4 pt-4">
          <CardTitle className="text-lg">Search Stores</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              type="search"
              placeholder="Search by store name..."
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
          <AlertTitle>Error Loading Stores</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && stores.length === 0 && !error && (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
          <p className="text-xl mb-4">
            {debouncedSearchTerm ? `No stores found matching "${debouncedSearchTerm}".` : "No stores available at the moment."}
          </p>
          {debouncedSearchTerm && <p>Try a different search term or browse all stores.</p>}
        </div>
      )}

      {stores.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}

      {hasMore && !loading && stores.length > 0 && (
        <div className="mt-10 text-center">
          <Button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load More Stores
          </Button>
        </div>
      )}
       {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
    </div>
  );
}
