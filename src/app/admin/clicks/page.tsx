
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const CLICKS_PER_PAGE = 25;

function AdminClicksPageContent() {
  const [clicks, setClicks] = useState<Click[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'storeId' | 'productId' | 'couponId' | 'userId'>('all');


  const fetchClicks = useCallback(async (
    isLoadMoreOperation = false,
    currentSearchTerm = debouncedSearchTerm,
    currentFilterType = filterType,
    docToStartAfter = lastVisible
  ) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
        if(isMounted) {
            setPageError(firebaseInitializationError || "Database connection not available.");
            if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
            setHasMore(false);
        }
      return () => { isMounted = false; };
    }

    if (!isLoadMoreOperation) {
      setLoading(true);
      setClicks([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      if (!docToStartAfter) {
        if(isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      setLoadingMore(true);
    }
    if(!isLoadMoreOperation) setPageError(null);
    setIsSearching(currentSearchTerm !== '' || currentFilterType !== 'all');

    try {
      const clicksCollection = collection(db, 'clicks');
      const constraints: QueryConstraint[] = [];

      if (currentSearchTerm) {
        if (currentFilterType === 'userId' || currentFilterType === 'all') { // Default search to userId if 'all'
            constraints.push(where('userId', '==', currentSearchTerm));
        } else if (currentFilterType === 'storeId') {
            constraints.push(where('storeId', '==', currentSearchTerm));
        } else if (currentFilterType === 'productId') {
            constraints.push(where('productId', '==', currentSearchTerm));
        } else if (currentFilterType === 'couponId') {
            constraints.push(where('couponId', '==', currentSearchTerm));
        }
      }
      
      // Add a general filter if no search term but a specific type is selected (other than userId)
      if (!currentSearchTerm && currentFilterType !== 'all' && currentFilterType !== 'userId') {
          constraints.push(where(currentFilterType, '!=', null)); // e.g., where('productId', '!=', null)
      }


      constraints.push(orderBy('timestamp', 'desc'));
      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(CLICKS_PER_PAGE));

      const q = query(clicksCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const clicksData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id, // This is the clickId used as document ID
          ...data,
          timestamp: safeToDate(data.timestamp) || new Date(0),
        } as Click;
      });
      
      if(isMounted) {
        setClicks(prev => isLoadMoreOperation ? [...prev, ...clicksData] : clicksData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === CLICKS_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching clicks:", err);
      if(isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load click history.";
        setPageError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if(isMounted) {
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [debouncedSearchTerm, filterType, lastVisible, toast]);

  useEffect(() => {
    fetchClicks(false);
  }, [fetchClicks]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Fetch is triggered by debouncedSearchTerm or filterType change via useEffect
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchClicks(true);
    }
  };

  if (loading && clicks.length === 0 && !pageError) {
    return <ClicksTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Click Logs</h1>

      {pageError && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filter & Search Clicks</CardTitle>
          <CardDescription>Search by ID based on the selected filter type.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
             <Select value={filterType} onValueChange={(value) => {
                setFilterType(value as any);
                setSearchTermInput(''); // Clear search term when filter changes
             }}>
                <SelectTrigger id="click-filter-type">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (Search by User ID)</SelectItem>
                  <SelectItem value="userId">User ID</SelectItem>
                  <SelectItem value="storeId">Store ID</SelectItem>
                  <SelectItem value="productId">Product ID</SelectItem>
                  <SelectItem value="couponId">Coupon ID</SelectItem>
                </SelectContent>
              </Select>
          </div>
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder={`Search by ${filterType === 'all' ? 'User ID' : filterType.replace('Id', ' ID')}...`}
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              disabled={isSearching || loading}
            />
            <Button type="submit" disabled={isSearching || loading}>
              {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Click Records</CardTitle>
          <CardDescription>List of all recorded user clicks on affiliate links.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && clicks.length === 0 ? (
            <ClicksTableSkeleton />
          ) : !loading && clicks.length === 0 && !pageError ? (
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
                    <TableHead>Type (ID)</TableHead>
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
                      <TableCell className="text-xs max-w-[150px] truncate">
                        {click.productId ? `Product: ${click.productName || click.productId}` :
                         click.couponId ? `Coupon: ${click.couponId}` :
                         'Store Visit'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}</TableCell>
                      <TableCell>
                        <a href={click.affiliateLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate block max-w-[200px]" title={click.affiliateLink}>
                          {click.affiliateLink} <ExternalLink className="h-3 w-3 inline-block ml-1" />
                        </a>
                      </TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[100px] text-right">{click.id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasMore && !loading && clicks.length > 0 && (
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
