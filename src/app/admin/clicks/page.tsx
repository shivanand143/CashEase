
// src/app/admin/clicks/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  startAfter,
  limit,
  getDocs,
  where,
  QueryConstraint,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Click } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2, Search, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { safeToDate } from '@/lib/utils';
import { format } from 'date-fns';
import AdminGuard from '@/components/guards/admin-guard';
import { useDebounce } from '@/hooks/use-debounce';

const CLICKS_PER_PAGE = 25;

function AdminClicksPageContent() {
  const [clicks, setClicks] = useState<Click[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'store' | 'product' | 'coupon'>('all');


  const fetchClicks = useCallback(async (loadMore = false) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
        if(isMounted) {
            setError(firebaseInitializationError || "Database connection not available.");
            if (!loadMore) setLoading(false); else setLoadingMore(false);
            setHasMore(false);
        }
      return () => { isMounted = false; };
    }

    if (!loadMore) {
      setLoading(true);
      setLastVisible(null);
      setClicks([]);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    if(!loadMore) setError(null);
    setIsSearching(debouncedSearchTerm !== '' || filterType !== 'all');

    try {
      const clicksCollection = collection(db, 'clicks');
      const constraints: QueryConstraint[] = [];

      if (debouncedSearchTerm) {
        // Basic search by user ID or store ID. More complex search might need Algolia/Typesense.
        // This example assumes searching by userId. Could add more `where` clauses if needed.
        constraints.push(where('userId', '==', debouncedSearchTerm));
      }

      if (filterType === 'store' && !filterType.includes('productId') && !filterType.includes('couponId')) {
        constraints.push(where('productId', '==', null), where('couponId', '==', null));
      } else if (filterType === 'product') {
        constraints.push(where('productId', '!=', null));
      } else if (filterType === 'coupon') {
        constraints.push(where('couponId', '!=', null));
      }
      

      constraints.push(orderBy('timestamp', 'desc'));
      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(CLICKS_PER_PAGE));

      const q = query(clicksCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const clicksData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: safeToDate(data.timestamp) || new Date(0),
        } as Click;
      });
      
      if(isMounted) {
        setClicks(prev => loadMore ? [...prev, ...clicksData] : clicksData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === CLICKS_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching clicks:", err);
      if(isMounted) {
        setError(err instanceof Error ? err.message : "Failed to load click history.");
        toast({ variant: "destructive", title: "Fetch Error", description: String(err) });
        setHasMore(false);
      }
    } finally {
      if(isMounted) {
        if (!loadMore) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, filterType, toast]); // Removed lastVisible

  useEffect(() => {
    fetchClicks(false);
  }, [fetchClicks]); // fetchClicks is stable

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchClicks(false); // Re-fetch with new search term
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchClicks(true); // Pass true for loadMore
    }
  };

  if (loading && clicks.length === 0 && !error) {
    return <ClicksTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Click Logs</h1>

      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filter & Search Clicks</CardTitle>
          <CardDescription>Search by User ID or filter by click type.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Search by User ID..."
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              disabled={isSearching || loading}
            />
            <Button type="submit" disabled={isSearching || loading}>
              {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
            </Button>
          </form>
          {/* Basic filter example, could be expanded */}
          {/* <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clicks</SelectItem>
              <SelectItem value="store">Store Visits</SelectItem>
              <SelectItem value="product">Product Clicks</SelectItem>
              <SelectItem value="coupon">Coupon Clicks</SelectItem>
            </SelectContent>
          </Select> */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Click Records</CardTitle>
          <CardDescription>List of all recorded user clicks on affiliate links.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && clicks.length === 0 && !error ? (
            <ClicksTableSkeleton />
          ) : !loading && clicks.length === 0 && !error ? (
            <p className="text-center text-muted-foreground py-8">
              {debouncedSearchTerm || filterType !== 'all' ? 'No clicks found matching your criteria.' : 'No clicks recorded yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Clicked At</TableHead>
                    <TableHead>Affiliate Link</TableHead>
                    <TableHead className="text-right">Click ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clicks.map((click) => (
                    <TableRow key={click.id}>
                      <TableCell className="font-mono text-xs truncate max-w-[100px]">{click.userId}</TableCell>
                      <TableCell className="truncate max-w-[150px]">{click.storeName || click.storeId}</TableCell>
                      <TableCell className="text-xs">
                        {click.productId ? `Product: ${click.productName || click.productId}` :
                         click.couponId ? `Coupon: ${click.couponId}` :
                         'Store Visit'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}</TableCell>
                      <TableCell>
                        <a href={click.affiliateLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate block max-w-[250px]" title={click.affiliateLink}>
                          {click.affiliateLink} <ExternalLink className="h-3 w-3 inline-block ml-1" />
                        </a>
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[150px] text-right">{click.id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasMore && !loading && (
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

function ClicksTableSkeleton() {
   return (
     <Card>
       <CardHeader>
         <Skeleton className="h-6 w-1/4 mb-2"/>
         <Skeleton className="h-4 w-1/2"/>
       </CardHeader>
       <CardContent>
         <div className="overflow-x-auto">
            <Table>
            <TableHeader>
                <TableRow>
                {Array.from({ length: 6 }).map((_, index) => (
                    <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 15 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                    {Array.from({ length: 6 }).map((_, colIndex) => (
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

export default function AdminClicksPage() {
    return (
      <AdminGuard>
        <AdminClicksPageContent />
      </AdminGuard>
    );
}
