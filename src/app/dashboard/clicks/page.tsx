
// src/app/dashboard/clicks/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
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
  DocumentData
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

const CLICKS_PER_PAGE = 20;

function ClickHistoryContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [clicks, setClicks] = useState<Click[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchClicks = useCallback(async (isLoadMoreOperation = false, docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null) => {
    let isMounted = true;
    console.log("Dashboard/Clicks: fetchClicks called. isLoadMore:", isLoadMoreOperation, "User:", user?.uid);

    if (!user) {
      console.log("Dashboard/Clicks: No user, aborting fetch.");
      if(isMounted) {
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
      }
      return () => { isMounted = false; };
    }

    if (firebaseInitializationError || !db) {
      console.error("Dashboard/Clicks: Firebase not initialized or DB error.");
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database not available.");
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!isLoadMoreOperation) {
      console.log("Dashboard/Clicks: Initial fetch, resetting states.");
      setLoading(true);
      setClicks([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      if (!docToStartAfter) {
        console.log("Dashboard/Clicks: Load more called but no cursor, aborting.");
        if(isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      console.log("Dashboard/Clicks: Loading more clicks.");
      setLoadingMore(true);
    }
    if (!isLoadMoreOperation) setPageError(null);


    try {
      const clicksCollection = collection(db, 'clicks');
      const constraints = [
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(CLICKS_PER_PAGE)
      ];

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }

      const q = query(clicksCollection, ...constraints);
      console.log("Dashboard/Clicks: Executing query for user:", user.uid);
      const querySnapshot = await getDocs(q);
      console.log("Dashboard/Clicks: Query returned", querySnapshot.size, "documents.");

      const clicksData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: safeToDate(data.timestamp) || new Date(0),
        } as Click;
      });

      if(isMounted) {
        setClicks(prev => isLoadMoreOperation ? [...prev, ...clicksData] : clicksData);
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        setLastVisible(newLastVisible);
        setHasMore(querySnapshot.docs.length === CLICKS_PER_PAGE);
        console.log("Dashboard/Clicks: Clicks state updated. HasMore:", querySnapshot.docs.length === CLICKS_PER_PAGE);
      }

    } catch (err) {
      console.error("Dashboard/Clicks: Error fetching clicks:", err);
      if(isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load click history.";
        setPageError(errorMsg);
        setHasMore(false);
      }
    } finally {
      if(isMounted) {
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        console.log("Dashboard/Clicks: Fetch operation finished. Loading state:", !isLoadMoreOperation ? false : loading, "LoadingMore state:", isLoadMoreOperation ? false : loadingMore);
      }
    }
    return () => { isMounted = false; };
  }, [user]);

   useEffect(() => {
    if (user && !authLoading) {
      fetchClicks(false, null);
    } else if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router, fetchClicks]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchClicks(true, lastVisible);
    }
  };

  if (authLoading || (loading && clicks.length === 0 && !pageError)) {
    return <ClickHistoryTableSkeleton />;
  }

  if (!user && !authLoading) {
    return (
        <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Authentication Required</AlertTitle>
            <AlertDescription>
                Please log in to view your click history.
                <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => router.push('/login')}>Go to Login</Button>
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <MousePointerClick className="w-7 h-7" /> Click History
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
          {loading && clicks.length === 0 ? ( // Show skeleton if initial loading and no clicks yet
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
                    <TableHead>Store</TableHead>
                    <TableHead>Item Clicked</TableHead>
                    <TableHead>Clicked At</TableHead>
                    <TableHead>Link Clicked</TableHead>
                    <TableHead className="text-right">Click ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clicks.map((click) => (
                    <TableRow key={click.id}>
                      <TableCell className="font-medium">{click.storeName || click.storeId || 'N/A'}</TableCell>
                      <TableCell>
                        {click.productId ? `Product: ${click.productName || click.productId}` :
                         click.couponId ? `Coupon: ${click.couponId}` :
                         'Store Visit'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}</TableCell>
                      <TableCell>
                          <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs">
                              <a href={click.affiliateLink} target="_blank" rel="noopener noreferrer" title={click.affiliateLink} className="truncate block max-w-[200px]">
                                  {click.affiliateLink || 'N/A'} <ExternalLink className="h-3 w-3 ml-1 inline-block align-middle"/>
                              </a>
                          </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[100px] text-right">{click.clickId}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasMore && !loading && clicks.length > 0 &&(
            <div className="mt-6 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More Clicks
              </Button>
            </div>
          )}
           {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
        </CardContent>
      </Card>
    </div>
  );
}

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
   return (
     <ProtectedRoute>
       <ClickHistoryContent />
     </ProtectedRoute>
   );
 }
