// src/app/stores/page.tsx
"use client"; // Need client component for data fetching and interaction

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, query, where, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'; // Added pagination imports
import { db } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card'; // Removed Header/Title as they are within content now
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search, ShoppingBag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { logClick } from '@/lib/tracking'; // Import the tracking function
import { useAuth } from '@/hooks/use-auth'; // Import useAuth to get user ID

const STORES_PER_PAGE = 16; // Number of stores to load per page

export default function StoresPage() {
  const [allStores, setAllStores] = useState<Store[]>([]); // Holds all fetched stores for filtering
  const [displayedStores, setDisplayedStores] = useState<Store[]>([]); // Stores currently displayed
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth(); // Get the current user
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null); // For pagination
  const [hasMore, setHasMore] = useState(true); // Flag for more stores to load
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchInitialStores = async () => {
      setLoading(true);
      setError(null);
      setAllStores([]); // Reset stores
      setDisplayedStores([]);
      setLastVisible(null);
      setHasMore(true);

      try {
        const storesCollection = collection(db, 'stores');
        const q = query(
          storesCollection,
          where('isActive', '==', true),
          orderBy('name', 'asc'),
          limit(STORES_PER_PAGE)
        );
        const querySnapshot = await getDocs(q);
        const storesData = querySnapshot.docs.map(doc => mapDocToStore(doc));

        setAllStores(storesData);
        setDisplayedStores(storesData); // Initially display fetched stores
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
          orderBy('name', 'asc'),
          startAfter(lastVisible),
          limit(STORES_PER_PAGE)
        );
        const querySnapshot = await getDocs(q);
        const newStoresData = querySnapshot.docs.map(doc => mapDocToStore(doc));

        // Append new stores to both lists
        const updatedAllStores = [...allStores, ...newStoresData];
        setAllStores(updatedAllStores);
        // Also update displayed stores if no search term active
        if (!searchTerm) {
           setDisplayedStores(updatedAllStores);
        } else {
           // If searching, re-filter the combined list
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


  useEffect(() => {
    fetchInitialStores();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Fetch only once on mount

  // Helper to filter stores based on search term
  const filterStores = (term: string, storesToFilter: Store[]) => {
      const lowerCaseSearchTerm = term.toLowerCase();
      const results = storesToFilter.filter(store =>
        store.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        store.categories.some(cat => cat.toLowerCase().includes(lowerCaseSearchTerm))
      );
      setDisplayedStores(results);
  };


  useEffect(() => {
    // Filter stores whenever the search term or the list of all stores changes
    filterStores(searchTerm, allStores);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, allStores]); // Rerun filter when search or allStores updates

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
      const targetUrl = store.affiliateLink || '#'; // Fallback URL
      if (user) {
          try {
              // Log the click before redirecting
              await logClick(user.uid, store.id);
          } catch (clickError) {
              console.error("Error logging click:", clickError);
          }
      }
       window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };


  return (
    <div className="space-y-8 md:space-y-12">
      <section className="text-center pt-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">All Stores</h1>
        <p className="text-lg text-muted-foreground">Find cashback offers from your favorite brands.</p>
      </section>

      {/* Search Bar */}
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search stores or categories..."
          className="pl-10 w-full shadow-sm focus:ring-primary focus:border-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search stores"
        />
      </div>

      {/* Error Message */}
      {error && (
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stores Grid */}
      <section>
        {loading ? (
          // Skeleton Loading State
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
          // Display Stores
           <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {displayedStores.map((store) => (
                <Card key={store.id} className="group flex flex-col hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-border rounded-lg overflow-hidden">
                   <CardContent className="p-4 flex flex-col items-center justify-center flex-grow h-48"> {/* Fixed height for content */}
                      <Link href={`/stores/${store.id}`} className="block mb-3 flex-grow flex flex-col items-center justify-center" title={`View details for ${store.name}`}>
                         <Image
                           data-ai-hint={`${store.name} logo`}
                           src={store.logoUrl || `https://picsum.photos/seed/${store.id}/120/60`}
                           alt={`${store.name} Logo`}
                           width={120}
                           height={60}
                           className="object-contain max-h-[60px] mb-4 transition-transform duration-300 group-hover:scale-105" // Max height and hover effect
                           onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/120/60'; e.currentTarget.alt = 'Placeholder Logo'; }} // Fallback image
                         />
                         <p className="font-semibold text-center mb-1 group-hover:text-primary transition-colors">{store.name}</p>
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
                       <ShoppingBag className="mr-2 h-4 w-4" /> Shop Now
                     </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            {/* Load More Button */}
            {hasMore && !searchTerm && ( // Only show load more if not searching and more exist
                 <div className="mt-8 text-center">
                     <Button onClick={fetchMoreStores} disabled={loadingMore}>
                         {loadingMore ? 'Loading...' : 'Load More Stores'}
                     </Button>
                 </div>
             )}
             {/* Show message if searching and no results */}
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
          // No Stores Found (Initial Load)
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag className="mx-auto h-12 w-12 mb-4 text-gray-400" />
            <p className="text-lg font-semibold">No stores found.</p>
            <p>Check back later or contact support if you believe this is an error.</p>
          </div>
        )}
      </section>
    </div>
  );
}