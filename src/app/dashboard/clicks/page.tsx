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
import { AlertCircle, Loader2, MousePointerClick, ExternalLink, Eye } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";

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
  const isMountedRef = React.useRef(true);

  const [isFullTextDialogOpen, setIsFullTextDialogOpen] = React.useState(false);
  const [fullTextContent, setFullTextContent] = React.useState<{ title: string; content: string | null | undefined }>({ title: '', content: '' });

  const showFullText = (title: string, content: string | null | undefined) => {
    setFullTextContent({ title, content: content || "No details available." });
    setIsFullTextDialogOpen(true);
  };

  const fetchClicks = React.useCallback(async (isLoadMoreOp: boolean = false, docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null) => {
    if (!user || !isMountedRef.current) return;

    if (firebaseInitializationError || !db) {
      setPageError(firebaseInitializationError || "Database not available.");
      if (!isLoadMoreOp) setLoading(false); else setLoadingMore(false);
      setHasMore(false);
      return;
    }

    if (!isLoadMoreOp) {
      setLoading(true);
      setClicks([]);
      setLastVisible(null);
      setHasMore(true);
      setPageError(null);
    } else {
      if (!docToStartAfter) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }

    try {
      const clicksCollection = collection(db, 'clicks');
      const qConstraints = [
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(CLICKS_PER_PAGE)
      ];
      if (isLoadMoreOp && docToStartAfter) {
        qConstraints.push(startAfter(docToStartAfter));
      }
      const q = query(clicksCollection, ...qConstraints);
      const querySnapshot = await getDocs(q);

      const clicksData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: safeToDate(data.timestamp as Timestamp | undefined) || new Date(0),
        } as Click;
      });

      if(isMountedRef.current) {
        setClicks(prev => isLoadMoreOp ? [...prev, ...clicksData] : clicksData);
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
        if (!isLoadMoreOp) setLoading(false); else setLoadingMore(false);
      }
    }
  }, [user]);

  React.useEffect(() => {
    isMountedRef.current = true;
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setLoading(false);
      router.push('/login?message=Please login to view your click history.');
    } else {
      fetchClicks(false, null);
    }
    return () => { isMountedRef.current = false; };
  }, [user, authLoading, router, fetchClicks]);

  const handleLoadMore = () => {
    if (user && !loadingMore && hasMore && lastVisible) {
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
                    {clicks.map((click) => (
                        <TableRow key={click.id}>
                        <TableCell className="font-medium">
                          <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate block max-w-[150px]">{click.storeName || click.storeId || 'N/A'}</span></TooltipTrigger>
                            <TooltipContent><p>{click.storeName || click.storeId || 'N/A'}</p></TooltipContent>
                          </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
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
                           </TooltipProvider>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}</TableCell>
                        <TableCell className="text-xs">
                            {(click.affiliateLink && click.affiliateLink.length > 40) ? (
                                <span 
                                className="truncate block max-w-[200px] sm:max-w-xs md:max-w-sm cursor-pointer hover:text-primary"
                                onClick={() => showFullText("Affiliate Link", click.affiliateLink)}
                                >
                                    {click.affiliateLink.substring(0, 40)}...
                                    <Eye className="inline h-3 w-3 ml-1 opacity-70" />
                                </span>
                            ) : (
                                <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs">
                                    <a href={click.affiliateLink || '#'} target="_blank" rel="noopener noreferrer" title={click.affiliateLink || undefined} className="truncate block max-w-[200px] sm:max-w-xs md:max-w-sm">
                                        {click.affiliateLink || 'N/A'} <ExternalLink className="h-3 w-3 ml-1 inline-block align-middle"/>
                                    </a>
                                </Button>
                            )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-right">
                          <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate block max-w-[100px]">{click.clickId}</span></TooltipTrigger>
                            <TooltipContent><p>{click.clickId}</p></TooltipContent>
                          </Tooltip>
                          </TooltipProvider>
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
      <Dialog open={isFullTextDialogOpen} onOpenChange={setIsFullTextDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{fullTextContent.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-all">{fullTextContent.content}</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
