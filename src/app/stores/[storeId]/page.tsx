// src/app/stores/[storeId]/page.tsx
"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, Coupon } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft, Tag, ShoppingBag, Info, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from "@/hooks/use-toast";
import { logClick } from '@/lib/tracking';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';

export default function StoreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = params.storeId as string;
  const { user } = useAuth();

  const [store, setStore] = React.useState<Store | null>(null);
  const [coupons, setCoupons] = React.useState<Coupon[]>([]);
  const [loadingStore, setLoadingStore] = React.useState(true);
  const [loadingCoupons, setLoadingCoupons] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchStoreData = async () => {
      if (!storeId) return;
      setLoadingStore(true);
      setLoadingCoupons(true);
      setError(null);

      try {
        const storeDocRef = doc(db, 'stores', storeId);
        const storeDocSnap = await getDoc(storeDocRef);

        if (storeDocSnap.exists()) {
          const storeData = {
            id: storeDocSnap.id,
            ...storeDocSnap.data(),
            createdAt: storeDocSnap.data().createdAt?.toDate ? storeDocSnap.data().createdAt.toDate() : new Date(),
            updatedAt: storeDocSnap.data().updatedAt?.toDate ? storeDocSnap.data().updatedAt.toDate() : new Date(),
          } as Store;
          setStore(storeData);

          const couponsCollection = collection(db, 'coupons');
          const q = query(
            couponsCollection,
            where('storeId', '==', storeId),
            where('isActive', '==', true),
            orderBy('isFeatured', 'desc'),
            orderBy('createdAt', 'desc')
          );
          const couponsSnapshot = await getDocs(q);
          const couponsData = couponsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            expiryDate: doc.data().expiryDate?.toDate ? doc.data().expiryDate.toDate() : null,
            createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
            updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
          })) as Coupon[];
          setCoupons(couponsData);

        } else {
          setError("Store not found.");
        }
      } catch (err) {
        console.error("Error fetching store data:", err);
        setError("Failed to load store details. Please try again later.");
      } finally {
        setLoadingStore(false);
        setLoadingCoupons(false);
      }
    };

    fetchStoreData();
  }, [storeId]);

  const handleStoreClick = async (clickedStore: Store) => {
    if (user) {
      try {
        await logClick(user.uid, clickedStore.id);
        window.open(clickedStore.affiliateLink, '_blank', 'noopener,noreferrer');
      } catch (clickError) {
        console.error("Error logging click:", clickError);
        window.open(clickedStore.affiliateLink, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(clickedStore.affiliateLink, '_blank', 'noopener,noreferrer');
    }
  };

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

  const handleCouponClick = async (coupon: Coupon) => {
    if (user && store) {
      try {
        await logClick(user.uid, store.id, coupon.id);
        if (coupon.code) {
          copyToClipboard(coupon.code);
        }
        window.open(coupon.link || store.affiliateLink, '_blank', 'noopener,noreferrer');
      } catch (clickError) {
        console.error("Error logging coupon click:", clickError);
        if (coupon.code) {
          copyToClipboard(coupon.code);
        }
        window.open(coupon.link || (store?.affiliateLink ?? '#'), '_blank', 'noopener,noreferrer');
      }
    } else {
      if (coupon.code) {
        copyToClipboard(coupon.code);
      }
      window.open(coupon.link || (store?.affiliateLink ?? '#'), '_blank', 'noopener,noreferrer');
    }
  };

  if (loadingStore) {
    return (
      // Wrap skeleton in container
      <div className="container py-8">
        <div className="space-y-8">
          <Skeleton className="h-8 w-32" />
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-1 space-y-4">
              <Skeleton className="w-full h-48 rounded-lg" />
              <Skeleton className="h-10 w-full rounded" />
              <Skeleton className="h-6 w-3/4 rounded" />
              <Skeleton className="h-20 w-full rounded" />
            </div>
            <div className="md:col-span-2 space-y-6">
              <Skeleton className="h-8 w-48 rounded" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      // Wrap error in container
      <div className="container py-8">
        <div className="space-y-4">
          <Button variant="outline" onClick={() => router.back()} size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      // Wrap fallback in container
      <div className="container py-8">
        <div className="space-y-4">
          <Button variant="outline" onClick={() => router.back()} size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <p>Store not found.</p>
        </div>
      </div>
    );
  }


  return (
    // Wrap content in a container div with padding
    <div className="container py-8">
      <div className="space-y-8">
        <Button variant="outline" onClick={() => router.back()} size="sm" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {/* Store Info Column */}
          <div className="md:col-span-1 space-y-4 sticky top-20">
            <Card className="shadow-md border border-border overflow-hidden">
              <CardHeader className="items-center text-center p-6 bg-gradient-to-b from-muted/50 to-muted/20">
                <div className="relative w-32 h-16 mb-4">
                  <Image
                    data-ai-hint={`${store.name} logo large`}
                    src={store.logoUrl || `https://picsum.photos/seed/${store.id}/200/100`}
                    alt={`${store.name} Logo`}
                    layout="fill"
                    objectFit="contain"
                    onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/200/100'; e.currentTarget.alt = 'Placeholder Logo'; }}
                  />
                </div>
                <CardTitle className="text-2xl">{store.name}</CardTitle>
                <CardDescription className="text-primary font-semibold text-lg">{store.cashbackRate}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {store.description && (
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    <h4 className="font-semibold text-foreground mb-1 flex items-center gap-1"><Info size={16} /> About {store.name}</h4>
                    {store.description}
                  </div>
                )}
                <Separator />
                {store.categories?.length > 0 && (
                  <div className="text-sm space-y-1">
                    <h4 className="font-semibold text-foreground">Categories</h4>
                    <div className="flex flex-wrap gap-1">
                      {store.categories.map(cat => (
                        <Badge key={cat} variant="secondary">{cat}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Separator />
                <div className="text-xs text-muted-foreground">
                  * Cashback rates and terms are subject to change. Ensure you read offer details before purchasing.
                </div>
              </CardContent>
              <CardFooter className="p-4 border-t bg-muted/10">
                <Button size="lg" className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-md" onClick={() => handleStoreClick(store)}>
                  <ShoppingBag className="mr-2 h-5 w-5" /> Go to {store.name} & Earn
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Coupons Column */}
          <div className="md:col-span-2 space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Tag className="w-6 h-6 text-secondary" />
              Available Coupons & Deals for {store.name}
            </h2>
            <Separator />

            {loadingCoupons ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : coupons.length > 0 ? (
              coupons.map((coupon) => (
                <Card key={coupon.id} className="shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start sm:items-center border border-border rounded-lg overflow-hidden">
                  <CardContent className="p-4 flex-grow space-y-1">
                    <p className="font-semibold text-md">{coupon.description}</p>
                    {coupon.expiryDate && (
                      <p className="text-xs text-muted-foreground">
                        Expires: {coupon.expiryDate.toLocaleDateString()}
                      </p>
                    )}
                    {coupon.link && (
                      <a href={coupon.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                        View Offer Details <ExternalLink size={12} />
                      </a>
                    )}
                  </CardContent>
                  <CardFooter className="p-4 border-t sm:border-t-0 sm:border-l w-full sm:w-auto shrink-0 bg-muted/50">
                    {coupon.code ? (
                      <Button variant="outline" className="w-full sm:w-auto border-dashed border-accent text-accent hover:bg-accent/10 hover:text-accent" onClick={() => handleCouponClick(coupon)}>
                        <span className="mr-2">{coupon.code}</span>
                        <span>Copy Code</span>
                      </Button>
                    ) : (
                      <Button className="w-full sm:w-auto bg-secondary hover:bg-secondary/90" onClick={() => handleCouponClick(coupon)}>
                        Get Deal
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground py-4">No active coupons found for this store right now. Check back later!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
