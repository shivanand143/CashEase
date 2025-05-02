// src/app/stores/page.tsx
"use client"; // Need client component for data fetching and interaction

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search, ShoppingBag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { logClick } from '@/lib/tracking'; // Import the tracking function
import { useAuth } from '@/hooks/use-auth'; // Import useAuth to get user ID

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth(); // Get the current user

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      setError(null);
      try {
        const storesCollection = collection(db, 'stores');
        // Query active stores, order by name
        const q = query(storesCollection, where('isActive', '==', true), orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        const storesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Ensure date fields are converted if stored as Timestamps
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
          updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
        })) as Store[];
        setStores(storesData);
        setFilteredStores(storesData); // Initialize filtered list
      } catch (err) {
        console.error("Error fetching stores:", err);
        setError("Failed to load stores. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, []);

  useEffect(() => {
    // Filter stores based on search term
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const results = stores.filter(store =>
      store.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      store.categories.some(cat => cat.toLowerCase().includes(lowerCaseSearchTerm))
    );
    setFilteredStores(results);
  }, [searchTerm, stores]);

  const handleStoreClick = async (store: Store) => {
      if (user) {
          try {
              // Log the click before redirecting
              await logClick(user.uid, store.id);
              // Redirect to the affiliate link in a new tab
              window.open(store.affiliateLink, '_blank', 'noopener,noreferrer');
          } catch (clickError) {
              console.error("Error logging click:", clickError);
              // Still attempt to redirect even if logging fails
              window.open(store.affiliateLink, '_blank', 'noopener,noreferrer');
          }
      } else {
          // If user is not logged in, just redirect
           window.open(store.affiliateLink, '_blank', 'noopener,noreferrer');
          // Optionally, prompt the user to log in first
          // e.g., show a modal or redirect to login page with a return URL
          // router.push(`/login?returnTo=${encodeURIComponent(store.affiliateLink)}`);
      }
  };


  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">All Stores</h1>
        <p className="text-lg text-muted-foreground">Find cashback offers from your favorite brands.</p>
      </section>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search stores or categories..."
          className="pl-10 w-full md:w-1/2 lg:w-1/3"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search stores"
        />
      </div>

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stores Grid */}
      <section>
        {loading ? (
          // Skeleton Loading State
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, index) => (
              <Card key={index}>
                <CardContent className="p-4 flex flex-col items-center justify-center h-48">
                  <Skeleton className="h-16 w-32 mb-4" />
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
                <CardFooter className="p-2">
                  <Skeleton className="h-8 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : filteredStores.length > 0 ? (
          // Display Stores
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredStores.map((store) => (
              <Card key={store.id} className="flex flex-col hover:shadow-lg transition-shadow duration-200">
                <CardContent className="p-4 flex flex-col items-center justify-center flex-grow">
                   <Link href={`/stores/${store.id}`} className="contents" title={`View details for ${store.name}`}>
                      <Image
                        data-ai-hint={`${store.name} logo`}
                        src={store.logoUrl || `https://picsum.photos/seed/${store.id}/120/60`}
                        alt={`${store.name} Logo`}
                        width={120}
                        height={60}
                        className="object-contain mb-4 h-[60px]" // Fixed height
                        onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/120/60'; e.currentTarget.alt = 'Placeholder Logo'; }} // Fallback image
                      />
                      <p className="font-semibold text-center mb-1">{store.name}</p>
                      <p className="text-sm text-primary font-medium text-center">{store.cashbackRate}</p>
                   </Link>
                </CardContent>
                <CardFooter className="p-2 border-t">
                  {/* Use onClick handler for tracking and redirect */}
                   <Button
                       variant="default"
                       size="sm"
                       className="w-full bg-secondary hover:bg-secondary/90"
                       onClick={() => handleStoreClick(store)}
                       title={`Shop at ${store.name} and earn cashback`}
                   >
                     <ShoppingBag className="mr-2 h-4 w-4" /> Shop Now
                   </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          // No Stores Found Message
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">No stores found matching your search "{searchTerm}".</p>
            <p>Try searching for something else or browse all stores.</p>
             <Button variant="link" onClick={() => setSearchTerm('')} className="mt-4">
               Clear Search
             </Button>
          </div>
        )}
      </section>
    </div>
  );
}
