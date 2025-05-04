// src/app/stores/page.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, query, where, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search, ShoppingBag, BadgePercent } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { logClick } from '@/lib/tracking';
import { useAuth } from '@/hooks/use-auth';
import { cn } from "@/lib/utils";

const STORES_PER_PAGE = 16;

export default function StoresPage() {
  const [allStores, setAllStores] = React.useState<Store[]>([]);
  const [displayedStores, setDisplayedStores] = React.useState<Store[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const { user } = useAuth();
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const fetchInitialStores = async () => {
      setLoading(true);
      setError(null);
      setAllStores([]);
      setDisplayedStores([]);
      setLastVisible(null);
      setHasMore(true);

      try {
        const storesCollection = collection(db, 'stores');
        const q = query(
          storesCollection,
          where('isActive', '==', true),
          orderBy('isFeatured', 'desc'),
          orderBy('name', 'asc'),
          limit(STORES_PER_PAGE)
        );
        const querySnapshot = await getDocs(q);
        const storesData = querySnapshot.docs.map(doc => mapDocToStore(doc));

        setAllStores(storesData);
        setDisplayedStores(storesData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length === STORES_PER_PAGE);
      } catch (err) {
        console.error("Error fetching initial stores:", err);
        setError("Failed to load stores. Please try again later.");
      } finally {
        setLoading(false);
      }
  };

  const fetchMoreStores = async () => {
      if (!lastVisible || !hasMore || loadingMore) return;
      setLoadingMore(true);
      setError(null);

      try {
        const storesCollection = collection(db, 'stores');
        const q = query(
          storesCollection,
          where('isActive', '==', true),
          orderBy('isFeatured', 'desc'),
          orderBy('name', 'asc'),
          startAfter(lastVisible),
          limit(STORES_PER_PAGE)
        );
        const querySnapshot = await getDocs(q);
        const newStoresData = querySnapshot.docs.map(doc => mapDocToStore(doc));

        const updatedAllStores = [...allStores, ...newStoresData];
        setAllStores(updatedAllStores);
        if (!searchTerm) {
           setDisplayedStores(updatedAllStores);
        } else {
            filterStores(searchTerm, updatedAllStores);
        }

        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length === STORES_PER_PAGE);
      } catch (err) {
        console.error("Error fetching more stores:", err);
        setError("Failed to load more stores.");
      } finally {
        setLoadingMore(false);
      }
  };


  React.useEffect(() => {
    fetchInitialStores();
  }, []);

  const filterStores = (term: string, storesToFilter: Store[]) => {
      const lowerCaseSearchTerm = term.toLowerCase();
      const results = storesToFilter.filter(store =>
        store.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        store.categories.some(cat => cat.toLowerCase().includes(lowerCaseSearchTerm))
      );
      setDisplayedStores(results);
  };


  React.useEffect(() => {
    filterStores(searchTerm, allStores);
  }, [searchTerm, allStores]);

  const mapDocToStore = (doc: QueryDocumentSnapshot<DocumentData>): Store => {
      const data = doc.data();
      return {
          id: doc.id,
          name: data.name || 'Unnamed Store',
          logoUrl: data.logoUrl || null,
          affiliateLink: data.affiliateLink || '#',
          cashbackRate: data.cashbackRate || 'N/A',
          cashbackRateValue: data.cashbackRateValue || 0,
          cashbackType: data.cashbackType || 'percentage',
          description: data.description || '',
          categories: data.categories || [],
          isActive: data.isActive === true,
          isFeatured: data.isFeatured === true,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
      } as Store;
  };


  const handleStoreClick = async (store: Store) => {
      const targetUrl = store.affiliateLink || '#';
      if (user) {
          try {
              await logClick(user.uid, store.id);
          } catch (clickError) {
              console.error("Error logging click:", clickError);
          }
      }
       window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };


  return (
    // Wrap content in a container div with padding
    <div className="container py-8">
      <div className="space-y-8 md:space-y-12">
        <section className="text-center pt-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">All Stores</h1>
          <p className="text-lg text-muted-foreground">Find cashback offers from your favorite brands.</p>
        </section>

        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search stores or categories..."
            className="pl-10 w-full shadow-sm focus:ring-primary focus:border-primary h-11 text-base"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search stores"
          />
        </div>

        {error && (
          <Alert variant="destructive" className="max-w-xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {[...Array(STORES_PER_PAGE)].map((_, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardContent className="p-4 flex flex-col items-center justify-center h-48">
                    <Skeleton className="h-16 w-32 mb-4 bg-muted/80" />
                    <Skeleton className="h-4 w-24 mb-2 bg-muted/80" />
                    <Skeleton className="h-4 w-20 bg-muted/80" />
                  </CardContent>
                  <CardFooter className="p-2 bg-muted/30">
                    <Skeleton className="h-9 w-full bg-muted/80" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : displayedStores.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {displayedStores.map((store) => (
                  <Card key={store.id} className="group flex flex-col hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-border rounded-lg overflow-hidden bg-card">
                    <CardContent className="p-4 flex flex-col items-center justify-center flex-grow h-48">
                      <Link href={`/stores/${store.id}`} className="block mb-3 flex-grow flex flex-col items-center justify-center" title={`View details for ${store.name}`}>
                        <Image
                          data-ai-hint={`${store.name} logo`}
                          src={store.logoUrl || `https://picsum.photos/seed/${store.id}/120/60`}
                          alt={`${store.name} Logo`}
                          width={120}
                          height={60}
                          className="object-contain max-h-[60px] mb-4 transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/120/60'; e.currentTarget.alt = 'Placeholder Logo'; }}
                        />
                        <p className="font-semibold text-center mb-1 group-hover:text-primary transition-colors duration-200">{store.name}</p>
                        <p className="text-sm text-primary font-medium text-center">{store.cashbackRate}</p>
                      </Link>
                    </CardContent>
                    <CardFooter className="p-2 border-t bg-muted/30">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-secondary font-semibold hover:bg-secondary/10 hover:text-secondary"
                        onClick={() => handleStoreClick(store)}
                        title={`Shop at ${store.name} and earn cashback`}
                      >
                        <BadgePercent className="mr-2 h-4 w-4" /> Shop & Earn
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
              {hasMore && !searchTerm && (
                <div className="mt-8 text-center">
                  <Button onClick={fetchMoreStores} disabled={loadingMore} size="lg">
                    {loadingMore ? 'Loading...' : 'Load More Stores'}
                  </Button>
                </div>
              )}
              {searchTerm && displayedStores.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <ShoppingBag className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                  <p className="text-lg font-semibold">No stores found matching "{searchTerm}".</p>
                  <p>Try searching for something else or clear the search.</p>
                  <Button variant="link" onClick={() => setSearchTerm('')} className="mt-4">
                    Clear Search
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingBag className="mx-auto h-12 w-12 mb-4 text-gray-400" />
              {searchTerm ? (
                <>
                  <p className="text-lg font-semibold">No stores found matching "{searchTerm}".</p>
                  <p>Try searching for something else or clear the search.</p>
                  <Button variant="link" onClick={() => setSearchTerm('')} className="mt-4">
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">No active stores found.</p>
                  <p>Check back later or contact support if you believe this is an error.</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
