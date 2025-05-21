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

const CLICKS_PER_PAGE = 20;

function ClickHistoryTableSkeleton() {
   return (
     <Card>
       <CardHeader>
         <Skeleton className="h-6 w-1/3 mb-2" />
         <Skeleton className="h-4 w-2/3" />
       </CardHeader>
       <CardContent>
         <div className="overflow-x-auto">
            <Table>
            <TableHeader>
                <TableRow>
                {Array.from({ length: 5 }).map((_, index) => (
                    <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
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
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const fetchClicks = React.useCallback(async (isLoadMore = false, docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null) => {
    let isMounted = true;
    if (!user) {
      if (isMounted && !isLoadMore) setLoading(false);
      return () => { isMounted = false; };
    }

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database not available.");
        if (!isLoadMore) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }
    
    if (!isLoadMore) {
      setLoading(true);
      setClicks([]);
      setLastVisible(null);
      setHasMore(true);
      setPageError(null);
    } else {
      if (!docToStartAfter && isLoadMore) {
        if(isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      setLoadingMore(true);
    }

    try {
      const clicksCollection = collection(db, 'clicks');
      const constraints = [
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(CLICKS_PER_PAGE)
      ];

      if (isLoadMore && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }

      const q = query(clicksCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const clicksData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: safeToDate(data.timestamp as Timestamp | undefined) || new Date(0),
        } as Click;
      });

      if(isMounted) {
        setClicks(prev => isLoadMore ? [...prev, ...clicksData] : clicksData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(clicksData.length === CLICKS_PER_PAGE);
        if (!isLoadMore) setPageError(null);
      }
    } catch (err) {
      if(isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load click history.";
        setPageError(errorMsg);
        setHasMore(false);
      }
    } finally {
      if(isMounted) {
        if (!isLoadMore) setLoading(false);
        else setLoadingMore(false);
      }
    }
    return () => { isMounted = false; };
  }, [user, lastVisible]);

  React.useEffect(() => {
    let isMounted = true;
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      if(isMounted) {
        setLoading(false);
        router.push('/login?message=Please login to view your click history.');
      }
    } else {
      if(isMounted) {
        fetchClicks(false, null);
      }
    }
    return () => { isMounted = false; };
  }, [user, authLoading, router, fetchClicks]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchClicks(true, lastVisible);
    }
  };

  if (authLoading || (loading && clicks.length === 0 && !pageError)) {
    return <ProtectedRoute><ClickHistoryTableSkeleton /></ProtectedRoute>;
  }

  if (!user && !authLoading) {
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
      <TooltipProvider>
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
              {loading && clicks.length === 0 ? (
                  <ClickHistoryTableSkeleton />
              ) : !loading && clicks.length === 0 && !pageError ? (
                  <div className="text-center py-16 text-muted-foreground">
                  <p className="mb-4">You haven't clicked on any offers yet, or your clicks are older than 90 days.</p>
                  <Button asChild>
                      <Link href="/stores">Browse Stores & Offers</Link>
                  </Button>
                  </div>
              ) : (
                  <div className="overflow-x-auto">
                  <Table>
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
                      {clicks.map((click) => (
                          <TableRow key={click.id}>
                          <TableCell className="font-medium">
                            <Tooltip>
                              <TooltipTrigger asChild><span className="truncate block max-w-[150px]">{click.storeName || click.storeId || 'N/A'}</span></TooltipTrigger>
                              <TooltipContent><p>{click.storeName || click.storeId || 'N/A'}</p></TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                             <Tooltip>
                               <TooltipTrigger asChild>
                                <span className="truncate block max-w-[200px]">
                                  {click.productId ? `Product: ${click.productName || click.productId}` :
                                  click.couponId ? `Coupon: ${click.couponId}` : 
                                  'Store Visit'}
                                </span>
                               </TooltipTrigger>
                               <TooltipContent>
                                <p>
                                  {click.productId ? `Product: ${click.productName || click.productId}` :
                                  click.couponId ? `Coupon: ${click.couponId}` : 
                                  'Store Visit'}
                                </p>
                               </TooltipContent>
                             </Tooltip>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}</TableCell>
                          <TableCell>
                              <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs">
                                  <a href={click.affiliateLink} target="_blank" rel="noopener noreferrer" title={click.affiliateLink} className="truncate block max-w-[200px] sm:max-w-xs md:max-w-sm">
                                      {click.affiliateLink || 'N/A'} <ExternalLink className="h-3 w-3 ml-1 inline-block align-middle"/>
                                  </a>
                              </Button>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-right">
                            <Tooltip>
                              <TooltipTrigger asChild><span className="truncate block max-w-[100px]">{click.clickId}</span></TooltipTrigger>
                              <TooltipContent><p>{click.clickId}</p></TooltipContent>
                            </Tooltip>
                          </TableCell>
                          </TableRow>
                      ))}
                      </TableBody>
                  </Table>
                  </div>
              )}
              {hasMore && !loading && clicks.length > 0 &&(
                  <div className="mt-6 text-center">
                  <Button onClick={handleLoadMore} disabled={loadingMore || loading}>
                      {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Load More Clicks
                  </Button>
                  </div>
              )}
              {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
              </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    </ProtectedRoute>
  );
}
