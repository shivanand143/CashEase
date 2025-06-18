
// src/app/dashboard/clicks/page.tsx
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import type { Click } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { safeToDate } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertCircle, Loader2, MousePointerClick, ExternalLink } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  QueryConstraint
} from 'firebase/firestore';

const CLICKS_PER_PAGE = 20;

function ClickHistoryTableSkeleton() {
   return (
     <Card>
       <CardHeader>
         <Skeleton className="h-6 w-1/3 mb-2" />
         <Skeleton className="h-4 w-2/3" />
       </CardHeader>
       <CardContent>
         <div className="overflow-x-auto w-full">
            <Table>
            <TableHeader>
                <TableRow>
                {Array.from({ length: 5 }).map((_, index) => (
                    <TableHead key={index} className="min-w-[120px]"><Skeleton className="h-5 w-full" /></TableHead>
                ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                    {Array.from({ length: 5 }).map((_, colIndex) => (
                    <TableCell key={colIndex}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                </TableRow>
                ))}
            </TableBody>
            </Table>
         </div>
       </CardContent>
     </Card>
   );
 }

export default function ClickHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [clicks, setClicks] = React.useState<Click[]>([]);
  const [pageLoading, setPageLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const isMountedRef = React.useRef(true);


  const fetchInitialClicks = React.useCallback(async () => {
    if (!user || !isMountedRef.current) {
      if (isMountedRef.current) setPageLoading(false);
      return;
    }

    if (firebaseInitializationError || !db) {
      if (isMountedRef.current) {
        setPageError(firebaseInitializationError || "Database not available.");
        setPageLoading(false);
        setHasMore(false);
      }
      return;
    }

    setPageLoading(true);
    setClicks([]);
    setLastVisible(null);
    setHasMore(true);
    setPageError(null);

    try {
      const clicksCollection = collection(db, 'clicks');
     const qConstraints: QueryConstraint[] = [
  where('userId', '==', user.uid),
  orderBy('timestamp', 'desc'),
  ...(lastVisible ? [startAfter(lastVisible)] : []),
  limit(CLICKS_PER_PAGE)
];

      
      const q = query(clicksCollection, ...qConstraints);
      const querySnapshot = await getDocs(q);
      const clicksData: Click[] = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
      
        return {
          id: docSnap.id,
          clickId: data.clickId || '',
          userId: data.userId ?? null,
          storeId: data.storeId || '',
          storeName: data.storeName ?? null,
          couponId: data.couponId ?? null,
          productId: data.productId ?? null,
          productName: data.productName ?? null,
          affiliateLink: data.affiliateLink || '',
          originalLink: data.originalLink ?? null,
          timestamp: data.timestamp as Timestamp,
          userAgent: data.userAgent ?? null,
          clickedCashbackDisplay: data.clickedCashbackDisplay ?? null,
          clickedCashbackRateValue: data.clickedCashbackRateValue ?? null,
          clickedCashbackType: data.clickedCashbackType ?? null,
          conversionId: data.conversionId ?? null,
          hasConversion: data.hasConversion ?? false,
        } satisfies Click;
      });
      

      if(isMountedRef.current) {
        setClicks(clicksData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(clicksData.length === CLICKS_PER_PAGE);
      }
    } catch (err) {
      if(isMountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load click history.";
        setPageError(errorMsg);
      }
    } finally {
      if(isMountedRef.current) {
        setPageLoading(false);
      }
    }
  }, [user]);

  const handleLoadMore = React.useCallback(async () => {
    if (!user || !lastVisible || !hasMore || loadingMore || !isMountedRef.current) return;

    setLoadingMore(true);
    setPageError(null);

    try {
      const clicksCollection = collection(db!, 'clicks');
      const qConstraints = [
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisible),
        limit(CLICKS_PER_PAGE)
      ];
      const q = query(clicksCollection, ...qConstraints);
      const querySnapshot = await getDocs(q);
      const clicksData: Click[] = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
      
        return {
          id: docSnap.id,
          clickId: data.clickId || '',
          userId: data.userId ?? null,
          storeId: data.storeId || '',
          storeName: data.storeName ?? null,
          couponId: data.couponId ?? null,
          productId: data.productId ?? null,
          productName: data.productName ?? null,
          affiliateLink: data.affiliateLink || '',
          originalLink: data.originalLink ?? null,
          timestamp: data.timestamp as Timestamp,
          userAgent: data.userAgent ?? null,
          clickedCashbackDisplay: data.clickedCashbackDisplay ?? null,
          clickedCashbackRateValue: data.clickedCashbackRateValue ?? null,
          clickedCashbackType: data.clickedCashbackType ?? null,
          conversionId: data.conversionId ?? null,
          hasConversion: data.hasConversion ?? false,
        } satisfies Click;
      });
      
      if(isMountedRef.current) {
        setClicks(prev => [...prev, ...clicksData]);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(clicksData.length === CLICKS_PER_PAGE);
      }
    } catch (err) {
      if(isMountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load more clicks.";
        setPageError(errorMsg);
      }
    } finally {
      if(isMountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [user, lastVisible, hasMore, loadingMore]);


  React.useEffect(() => {
    isMountedRef.current = true;
    if (authLoading) {
      setPageLoading(true); // Keep showing skeleton if auth is loading
      return;
    }
    if (!user) {
      if (isMountedRef.current) {
        setPageLoading(false); // Stop loading, ProtectedRoute will redirect
        router.push('/login?message=Please login to view your click history.');
      }
    } else {
      fetchInitialClicks();
    }
    return () => { isMountedRef.current = false; };
  }, [user, authLoading, router, fetchInitialClicks]);

  if (authLoading || pageLoading) {
    return <ProtectedRoute><ClickHistoryTableSkeleton /></ProtectedRoute>;
  }

  if (!user && !authLoading) {
    // Should be handled by ProtectedRoute redirect
    return (
      <ProtectedRoute>
        <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Authentication Required</AlertTitle>
            <AlertDescription>
                Please log in to view your click history.
                <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => router.push('/login')}>Go to Login</Button>
            </AlertDescription>
        </Alert>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <MousePointerClick className="w-6 h-6 sm:w-7 sm:h-7" /> Click History
        </h1>

        {pageError && (
            <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading History</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
            </Alert>
        )}

        <Card>
            <CardHeader>
            <CardTitle>Your Recent Clicks</CardTitle>
            <CardDescription>View the stores and offers you recently clicked on. Clicks are retained for 90 days.</CardDescription>
            </CardHeader>
            <CardContent>
            {clicks.length === 0 && !pageError ? (
                <div className="text-center py-16 text-muted-foreground">
                <p className="mb-4">You haven't clicked on any offers yet, or your clicks are older than 90 days.</p>
                <Button asChild>
                    <Link href="/stores">Browse Stores & Offers</Link>
                </Button>
                </div>
            ) : (
                <div className="overflow-x-auto w-full">
                <Table className="min-w-[800px]">
                    <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-[150px]">Store</TableHead>
                        <TableHead className="min-w-[200px]">Item Clicked</TableHead>
                        <TableHead className="min-w-[180px]">Clicked At</TableHead>
                        <TableHead className="min-w-[200px]">Link Clicked</TableHead>
                        <TableHead className="text-right min-w-[120px]">Click ID</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {clicks.map((click) => {
                        const clickTimestamp = safeToDate(click.timestamp);
                        return (
                          <TableRow key={click.id}>
                          <TableCell className="font-medium truncate max-w-[150px]" title={click.storeName || click.storeId || 'N/A'}>
                              {click.storeName || click.storeId || 'N/A'}
                          </TableCell>
                          <TableCell className="truncate max-w-[200px]" title={click.productId ? `Product: ${click.productName || click.productId}` : click.couponId ? `Coupon ID: ${click.couponId}` : 'Store Visit'}>
                              {click.productId ? `Product: ${click.productName || click.productId}` :
                              click.couponId ? `Coupon: ${click.couponId}` : 
                              'Store Visit'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {clickTimestamp ? format(clickTimestamp, 'PPp') : 'N/A'}
                          </TableCell>
                          <TableCell className="text-xs">
                               <TooltipProvider>
                                 <Tooltip>
                                   <TooltipTrigger asChild>
                                       <a href={click.affiliateLink || '#'} target="_blank" rel="noopener noreferrer" className="truncate block max-w-[200px] hover:text-primary">
                                           {click.affiliateLink || 'N/A'} <ExternalLink className="h-3 w-3 ml-1 inline-block align-middle opacity-70"/>
                                       </a>
                                   </TooltipTrigger>
                                   <TooltipContent>
                                       <p className="max-w-md break-all">{click.affiliateLink || 'No link available'}</p>
                                   </TooltipContent>
                                 </Tooltip>
                               </TooltipProvider>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-right truncate max-w-[120px]" title={click.clickId || undefined}>
                              {click.clickId}
                          </TableCell>
                          </TableRow>
                        );
                    })}
                    </TableBody>
                </Table>
                </div>
            )}
            {hasMore && clicks.length > 0 &&(
                <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore || pageLoading}>
                    {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Load More Clicks
                </Button>
                </div>
            )}
            {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
            </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
