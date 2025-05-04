// src/app/category/[slug]/page.tsx
"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, Coupon } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft, ShoppingBag, Tag, Info, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from "@/hooks/use-toast";
import { logClick } from '@/lib/tracking';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';

interface CouponWithStore extends Coupon {
  storeName: string;
  storeLogoUrl?: string;
}

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { toast } = useToast();
  const { user } = useAuth();

  const [stores, setStores] = React.useState<Store[]>([]);
  const [coupons, setCoupons] = React.useState<CouponWithStore[]>([]);
  const [loadingStores, setLoadingStores] = React.useState(true);
  const [loadingCoupons, setLoadingCoupons] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [categoryName, setCategoryName] = React.useState<string>('');

  React.useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      setLoadingStores(true);
      setLoadingCoupons(true);
      setError(null);

      const formattedCategoryName = slug.charAt(0).toUpperCase() + slug.slice(1);
      setCategoryName(formattedCategoryName);

      try {
        const storesCollection = collection(db, 'stores');
        const qStores = query(
            storesCollection,
            where('categories', 'array-contains', formattedCategoryName),
            where('isActive', '==', true),
            orderBy('name', 'asc')
        );
        const storesSnapshot = await getDocs(qStores);
        const storesData = storesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
          updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
        })) as Store[];
        setStores(storesData);

        if (storesData.length > 0) {
            const storeIds = storesData.map(s => s.id);
            const couponsCollection = collection(db, 'coupons');
             const storeIdChunks: string[][] = [];
             for (let i = 0; i < storeIds.length; i += 10) {
                 storeIdChunks.push(storeIds.slice(i, i + 10));
             }

            const couponPromises = storeIdChunks.map(chunk =>
                getDocs(query(
                    couponsCollection,
                    where('storeId', 'in', chunk),
                    where('isActive', '==', true),
                    orderBy('isFeatured', 'desc'),
                    orderBy('createdAt', 'desc')
                ))
            );

            const couponSnapshots = await Promise.all(couponPromises);
            const storesMap = new Map(storesData.map(s => [s.id, { name: s.name, logoUrl: s.logoUrl }]));
            const couponsData = couponSnapshots.flatMap(snapshot =>
                 snapshot.docs.map(doc => {
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
            );

             couponsData.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
             setCoupons(couponsData);

        } else {
             setCoupons([]);
        }


      } catch (err) {
        console.error("Error fetching category data:", err);
        setError(`Failed to load data for category "${formattedCategoryName}". Please try again later.`);
      } finally {
        setLoadingStores(false);
        setLoadingCoupons(false);
      }
    };

    fetchData();
  }, [slug]);

  const handleStoreClick = async (store: Store) => {
      const targetUrl = store.affiliateLink || '#';
      if (user) {
          try {
              await logClick(user.uid, store.id);
          } catch (clickError) {
              console.error("Error logging store click:", clickError);
          }
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
        <Button variant="outline" onClick={() => router.back()} size="sm" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <section className="text-center pt-4">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            {categoryName || <Skeleton className="h-10 w-48 mx-auto" />}
          </h1>
          <p className="text-lg text-muted-foreground">
            Cashback Stores & Offers in {categoryName || 'this category'}.
          </p>
        </section>

        {error && (
          <Alert variant="destructive" className="max-w-xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stores Section */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-primary" /> Stores in {categoryName}
          </h2>
          {loadingStores ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {[...Array(8)].map((_, index) => (
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
          ) : stores.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {stores.map((store) => (
                <Card key={store.id} className="group flex flex-col hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-border rounded-lg overflow-hidden">
                  <CardContent className="p-4 flex flex-col items-center justify-center flex-grow h-48">
                    <Link href={`/stores/${store.id}`} className="block mb-3 flex-grow flex flex-col items-center justify-center" title={`View details for ${store.name}`}>
                      <Image
                        data-ai-hint={`${store.name} logo category page`}
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
            <p className="text-center text-muted-foreground py-8">No stores found in this category.</p>
          )}
        </section>

        <Separator />

        {/* Coupons Section */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Tag className="w-6 h-6 text-secondary" /> Coupons for {categoryName}
          </h2>
          {loadingCoupons ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ) : coupons.length > 0 ? (
            <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {coupons.map((coupon) => (
                <Card key={coupon.id} className="group flex flex-col sm:flex-row hover:shadow-lg transition-shadow duration-300 border border-border rounded-lg overflow-hidden">
                  <CardContent className="p-4 flex-grow space-y-1 flex items-start gap-3">
                    <Link href={`/stores/${coupon.storeId}`} className="shrink-0 block p-1 border rounded-md hover:shadow-sm transition-shadow bg-background">
                      <Image
                        data-ai-hint={`${coupon.storeName} logo small coupon category`}
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
            <p className="text-center text-muted-foreground py-8">No active coupons found for stores in this category right now.</p>
          )}
        </section>
      </div>
    </div>
  );
}
