// src/app/search/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react'; // Import useState and useEffect
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, query, where, orderBy, or, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, Coupon } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search as SearchIcon, ShoppingBag, Tag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from "@/hooks/use-toast";
import { logClick } from '@/lib/tracking';
import { useAuth } from '@/hooks/use-auth';
import { Separator } from '@/components/ui/separator'; // Import Separator

// Combine Coupon with basic Store info for display
interface CouponWithStore extends Coupon {
  storeName: string;
  storeLogoUrl?: string;
}

const RESULTS_LIMIT = 20; // Limit the number of initial results per type

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryParam = searchParams.get('q');
  const { toast } = useToast();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState(queryParam || '');
  const [stores, setStores] = useState<Store[]>([]);
  const [coupons, setCoupons] = useState<CouponWithStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      if (!searchTerm.trim()) {
          setStores([]);
          setCoupons([]);
          setLoading(false);
          return;
      }

      setLoading(true);
      setError(null);
      const lowerCaseSearchTerm = searchTerm.toLowerCase();

      try {
        // 1. Search Stores
        const storesCollection = collection(db, 'stores');
        // Simple name search (consider adding category search)
        // Firestore doesn't support case-insensitive search directly or partial string match easily.
        // For a production app, consider using a dedicated search service like Algolia or Elasticsearch.
        // Workaround: Fetching stores and filtering client-side (not scalable) or structuring data for search.
        // For now, let's query based on exact match or prefix (less ideal).
         const qStores = query(
           storesCollection,
           where('isActive', '==', true),
           // where('name', '>=', searchTerm), // Example prefix search (case-sensitive)
           // where('name', '<=', searchTerm + '\uf8ff')
            orderBy('name', 'asc') // Order is needed for range queries
           // limit(RESULTS_LIMIT) // Limit results
         );
        const storesSnapshot = await getDocs(qStores);
         // Client-side filtering (less efficient for large datasets)
         const storesData = storesSnapshot.docs.map(doc => ({
             id: doc.id,
             ...doc.data(),
             createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
             updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
         }))
         .filter(store => store.name.toLowerCase().includes(lowerCaseSearchTerm) || store.categories.some(cat => cat.toLowerCase().includes(lowerCaseSearchTerm)))
         .slice(0, RESULTS_LIMIT) as Store[];

        setStores(storesData);


        // 2. Search Coupons
        const couponsCollection = collection(db, 'coupons');
        // Similar limitations apply here. We'll fetch recent active coupons and filter client-side.
        const qCoupons = query(
            couponsCollection,
            where('isActive', '==', true),
            orderBy('createdAt', 'desc'), // Get recent ones
            limit(50) // Fetch a larger batch for client-side filtering
        );
        const couponsSnapshot = await getDocs(qCoupons);

        // Fetch store names for coupons
        const storeIds = Array.from(new Set(couponsSnapshot.docs.map(doc => doc.data().storeId)));
        const storesMap = new Map<string, Pick<Store, 'name' | 'logoUrl'>>();
         if (storeIds.length > 0) {
            const storePromises = [];
            const batchSize = 10;
            for (let i = 0; i < storeIds.length; i += batchSize) {
                const batchIds = storeIds.slice(i, i + batchSize);
                const storesQuery = query(collection(db, 'stores'), where('__name__', 'in', batchIds));
                storePromises.push(getDocs(storesQuery));
            }
            const storeSnapshots = await Promise.all(storePromises);
            storeSnapshots.forEach(snapshot => {
                 snapshot.docs.forEach(docSnap => {
                     storesMap.set(docSnap.id, { name: docSnap.data().name, logoUrl: docSnap.data().logoUrl });
                 });
            });
         }


         const couponsData = couponsSnapshot.docs.map(doc => {
              const coupon = {
                   id: doc.id,
                   ...doc.data(),
                   expiryDate: doc.data().expiryDate?.toDate ? doc.data().expiryDate.toDate() : null,
                   createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
                   updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
               } as Coupon;
               const storeInfo = storesMap.get(coupon.storeId);
               return {
                   ...coupon,
                   storeName: storeInfo?.name || 'Unknown Store',
                   storeLogoUrl: storeInfo?.logoUrl,
               } as CouponWithStore;
           })
           .filter(coupon =>
               coupon.description.toLowerCase().includes(lowerCaseSearchTerm) ||
               coupon.storeName.toLowerCase().includes(lowerCaseSearchTerm) ||
               coupon.code?.toLowerCase().includes(lowerCaseSearchTerm)
           ).slice(0, RESULTS_LIMIT);

        setCoupons(couponsData);

      } catch (err) {
        console.error("Error searching:", err);
        setError(`Failed to perform search for "${searchTerm}". Please try again later.`);
      } finally {
        setLoading(false);
      }
    };

    if (queryParam) {
        setSearchTerm(queryParam);
        fetchResults();
    } else {
        setLoading(false); // No query param, stop loading
        setStores([]);
        setCoupons([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParam]); // Re-run search when queryParam changes

  const handleStoreClick = async (store: Store) => {
    const targetUrl = store.affiliateLink || '#';
    if (user) {
      try { await logClick(user.uid, store.id); } catch (e) { console.error(e); }
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied!", description: "Coupon code copied." });
    }).catch(err => {
      toast({ variant: "destructive", title: "Error", description: "Could not copy code." });
    });
  };

  const handleCouponClick = async (coupon: CouponWithStore) => {
    const targetUrl = coupon.link || '#';
    if (user) {
      try { await logClick(user.uid, coupon.storeId, coupon.id); } catch (e) { console.error(e); }
    }
    if (coupon.code) copyToClipboard(coupon.code);
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-8 md:space-y-12">
      <section className="pt-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-2">
            <SearchIcon className="w-8 h-8" /> Search Results
        </h1>
        {searchTerm && (
            <p className="text-lg text-muted-foreground">
                Showing results for: <span className="font-semibold text-foreground">"{searchTerm}"</span>
            </p>
        )}
         {!searchTerm && !loading && (
            <p className="text-lg text-muted-foreground">
                Please enter a search term in the header search bar.
            </p>
         )}
      </section>

      {error && (
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Search Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results Sections */}
      {loading ? (
         <div className="space-y-12">
            {/* Store Skeleton */}
            <section>
               <Skeleton className="h-8 w-48 mb-6" />
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                 {[...Array(4)].map((_, index) => (
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
            </section>
             {/* Coupon Skeleton */}
             <section>
                 <Skeleton className="h-8 w-48 mb-6" />
                 <div className="space-y-4">
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                 </div>
             </section>
         </div>
      ) : (
          <div className="space-y-12">
            {/* Stores Results */}
            {(stores.length > 0 || coupons.length > 0) && (
               <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <ShoppingBag className="w-6 h-6 text-primary"/> Stores
                  </h2>
                  {stores.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {stores.map((store) => (
                           <Card key={store.id} className="group flex flex-col hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-border rounded-lg overflow-hidden">
                               <CardContent className="p-4 flex flex-col items-center justify-center flex-grow h-48">
                                  <Link href={`/stores/${store.id}`} className="block mb-3 flex-grow flex flex-col items-center justify-center" title={`View details for ${store.name}`}>
                                     <Image
                                       data-ai-hint={`${store.name} logo search results`}
                                       src={store.logoUrl || `https://picsum.photos/seed/${store.id}/120/60`}
                                       alt={`${store.name} Logo`}
                                       width={120}
                                       height={60}
                                       className="object-contain max-h-[60px] mb-4 transition-transform duration-300 group-hover:scale-105"
                                       onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/120/60'; }}
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
                  ) : (
                      <p className="text-muted-foreground">No stores found matching "{searchTerm}".</p>
                  )}
               </section>
            )}

             {/* Coupons Results */}
             {(stores.length > 0 || coupons.length > 0) && <Separator />}

            {(stores.length > 0 || coupons.length > 0) && (
               <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <Tag className="w-6 h-6 text-secondary"/> Coupons & Deals
                  </h2>
                  {coupons.length > 0 ? (
                       <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                          {coupons.map((coupon) => (
                            <Card key={coupon.id} className="group flex flex-col sm:flex-row hover:shadow-lg transition-shadow duration-300 border border-border rounded-lg overflow-hidden">
                               <CardContent className="p-4 flex-grow space-y-1 flex items-start gap-3">
                                  <Link href={`/stores/${coupon.storeId}`} className="shrink-0 block p-1 border rounded-md hover:shadow-sm transition-shadow bg-background">
                                     <Image
                                       data-ai-hint={`${coupon.storeName} logo small coupon search`}
                                       src={coupon.storeLogoUrl || `https://picsum.photos/seed/${coupon.storeId}/60/40`}
                                       alt={`${coupon.storeName} Logo`}
                                       width={50}
                                       height={30}
                                       className="object-contain h-[30px] w-[50px]"
                                        onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/50/30'; }}
                                     />
                                  </Link>
                                  <div className="flex-grow">
                                     <p className="font-semibold text-md line-clamp-2">{coupon.description}</p>
                                      <p className="text-xs text-muted-foreground">
                                         For <Link href={`/stores/${coupon.storeId}`} className="hover:underline text-primary">{coupon.storeName}</Link>
                                         {coupon.expiryDate && ` • Expires: ${coupon.expiryDate.toLocaleDateString()}`}
                                      </p>
                                  </div>
                               </CardContent>
                              <CardFooter className="p-3 border-t sm:border-t-0 sm:border-l w-full sm:w-auto shrink-0 flex items-center justify-center">
                                {coupon.code ? (
                                  <Button variant="outline" className="w-full sm:w-auto border-dashed border-accent text-accent hover:bg-accent/10 hover:text-accent" onClick={() => handleCouponClick(coupon)}>
                                    <span className="mr-2 font-mono">{coupon.code}</span>
                                    <span>Copy</span>
                                  </Button>
                                ) : (
                                  <Button className="w-full sm:w-auto bg-secondary hover:bg-secondary/90" onClick={() => handleCouponClick(coupon)}>
                                    Get Deal
                                  </Button>
                                )}
                              </CardFooter>
                            </Card>
                          ))}
                       </div>
                  ) : (
                      <p className="text-muted-foreground">No coupons or deals found matching "{searchTerm}".</p>
                  )}
               </section>
            )}

            {/* No results overall */}
             {stores.length === 0 && coupons.length === 0 && searchTerm && (
                <div className="text-center py-16 text-muted-foreground">
                   <SearchIcon className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                   <p className="text-lg font-semibold">No results found for "{searchTerm}".</p>
                   <p>Try searching for a different store, coupon, or category.</p>
                </div>
            )}
          </div>
      )}

    </div>
  );
}
