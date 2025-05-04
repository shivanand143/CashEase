// src/app/coupons/page.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'; // Removed unused imports (doc, getDoc)
import { db } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search, Tag, Copy } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from "@/hooks/use-toast";
import { logClick } from '@/lib/tracking';
import { useAuth } from '@/hooks/use-auth';
import { cn } from "@/lib/utils";

interface CouponWithStore extends Coupon {
  storeName: string;
  storeLogoUrl?: string;
  storeAffiliateLink: string;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [filteredCoupons, setFilteredCoupons] = React.useState<CouponWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const { toast } = useToast();
  const { user } = useAuth();


  React.useEffect(() => {
    const fetchCouponsAndStores = async () => {
      setLoading(true);
      setError(null);
      try {
        const couponsCollection = collection(db, 'coupons');
        const qCoupons = query(
            couponsCollection,
            where('isActive', '==', true),
            orderBy('isFeatured', 'desc'),
            orderBy('createdAt', 'desc')
        );
        const couponsSnapshot = await getDocs(qCoupons);
        const couponsData = couponsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            expiryDate: doc.data().expiryDate?.toDate ? doc.data().expiryDate.toDate() : null,
            createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
            updatedAt: doc.data().updatedAt.toDate ? doc.data().updatedAt.toDate() : new Date(),
        })) as Coupon[];

        const storeIds = Array.from(new Set(couponsData.map(c => c.storeId)));

        const storesMap = new Map<string, Pick<Store, 'name' | 'logoUrl' | 'affiliateLink'>>();
        if (storeIds.length > 0) {
            const storePromises = [];
            const batchSize = 10;
            for (let i = 0; i < storeIds.length; i += batchSize) {
                const batchIds = storeIds.slice(i, i + batchSize);
                const storesCollectionRef = collection(db, 'stores'); // Renamed variable
                const qStores = query(storesCollectionRef, where('__name__', 'in', batchIds));
                storePromises.push(getDocs(qStores));
            }

            const storeSnapshots = await Promise.all(storePromises);
            storeSnapshots.forEach(snapshot => {
                 snapshot.docs.forEach(docSnap => {
                     storesMap.set(docSnap.id, {
                         name: docSnap.data().name || 'Unknown Store',
                         logoUrl: docSnap.data().logoUrl,
                         affiliateLink: docSnap.data().affiliateLink || '#'
                     });
                 });
            });
        }


        const combinedData = couponsData.map(coupon => {
          const storeInfo = storesMap.get(coupon.storeId);
          return {
            ...coupon,
            storeName: storeInfo?.name ?? 'Unknown Store',
            storeLogoUrl: storeInfo?.logoUrl,
            storeAffiliateLink: storeInfo?.affiliateLink || '#'
          };
        }).filter(c => storesMap.has(c.storeId));

        setCoupons(combinedData);
        setFilteredCoupons(combinedData);

      } catch (err) {
        console.error("Error fetching coupons:", err);
        setError("Failed to load coupons. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchCouponsAndStores();
  }, []);

  React.useEffect(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const results = coupons.filter(coupon =>
      coupon.description.toLowerCase().includes(lowerCaseSearchTerm) ||
      coupon.storeName.toLowerCase().includes(lowerCaseSearchTerm) ||
      coupon.code?.toLowerCase().includes(lowerCaseSearchTerm)
    );
    setFilteredCoupons(results);
  }, [searchTerm, coupons]);

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        toast({
          title: "Copied!",
          description: "Coupon code copied to clipboard.",
        });
      }).catch(err => {
        console.error('Failed to copy: ', err);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not copy code.",
        });
      });
  };


   const handleCouponClick = async (coupon: CouponWithStore) => {
       const targetUrl = coupon.link || coupon.storeAffiliateLink || '#';
       if (user) {
           try {
               await logClick(user.uid, coupon.storeId, coupon.id);
           } catch (clickError) {
               console.error("Error logging coupon click:", clickError);
           }
       }
        if (coupon.code) {
          copyToClipboard(coupon.code);
        }
       window.open(targetUrl, '_blank', 'noopener,noreferrer');
   };

  return (
    // Wrap content in a container div with padding
    <div className="container py-8">
      <div className="space-y-8 md:space-y-12">
        <section className="text-center pt-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Coupons & Deals</h1>
          <p className="text-lg text-muted-foreground">Find the latest discount codes and offers.</p>
        </section>

        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search coupons or stores..."
            className="pl-10 w-full shadow-sm focus:ring-primary focus:border-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search coupons"
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {[...Array(9)].map((_, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3 mb-2">
                      <Skeleton className="h-10 w-16 rounded-sm bg-muted/80" />
                      <div className="space-y-1 flex-grow">
                        <Skeleton className="h-4 w-3/4 bg-muted/80" />
                        <Skeleton className="h-3 w-1/2 bg-muted/80" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-full bg-muted/80" />
                  </CardHeader>
                  <CardContent className="py-4">
                    <Skeleton className="h-4 w-5/6 bg-muted/80" />
                  </CardContent>
                  <CardFooter className="p-4 border-t bg-muted/30">
                    <Skeleton className="h-10 w-full bg-muted/80" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : filteredCoupons.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {filteredCoupons.map((coupon) => (
                <Card key={coupon.id} className="group flex flex-col hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-border rounded-lg overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3 mb-2">
                      <Link href={`/stores/${coupon.storeId}`} className="shrink-0 block p-1 border rounded-md hover:shadow-sm transition-shadow">
                        <Image
                          data-ai-hint={`${coupon.storeName} logo small`}
                          src={coupon.storeLogoUrl || `https://picsum.photos/seed/${coupon.storeId}/60/40`}
                          alt={`${coupon.storeName} Logo`}
                          width={60}
                          height={40}
                          className="object-contain h-[40px] w-[60px]"
                          onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/60/40'; }}
                        />
                      </Link>
                      <div className="flex-grow">
                        <Link href={`/stores/${coupon.storeId}`}>
                          <CardTitle className="text-md hover:text-primary transition-colors line-clamp-1">{coupon.storeName}</CardTitle>
                        </Link>
                        {coupon.expiryDate && (
                          <p className="text-xs text-muted-foreground">
                            Expires: {coupon.expiryDate.toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <CardDescription className="text-base text-foreground font-semibold leading-snug line-clamp-2 h-[3em]">
                      {coupon.description}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="p-4 border-t mt-auto bg-muted/30">
                    {coupon.code ? (
                      <Button variant="outline" className="w-full justify-between border-dashed border-accent text-accent hover:bg-accent/10 hover:text-accent focus:ring-accent" onClick={() => handleCouponClick(coupon)}>
                        <span className="font-mono font-bold truncate">{coupon.code}</span>
                        <span className="flex items-center gap-1">
                          <Copy className="w-4 h-4" /> Copy
                        </span>
                      </Button>
                    ) : (
                      <Button className="w-full bg-secondary hover:bg-secondary/90" onClick={() => handleCouponClick(coupon)}>
                        Get Deal
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Tag className="mx-auto h-12 w-12 mb-4 text-gray-400" />
              <p className="text-lg font-semibold">No coupons found matching "{searchTerm}".</p>
              <p>Try searching for something else or check back later!</p>
              <Button variant="link" onClick={() => setSearchTerm('')} className="mt-4">
                Clear Search
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
