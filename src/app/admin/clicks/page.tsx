
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link'; // Keep if any links are used, though not directly in this version
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
  QueryDocumentSnapshot,
  Timestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Click, Store, UserProfile } from '@/lib/types';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Search, ExternalLink, MousePointerClick } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import { format } from 'date-fns';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate } from '@/lib/utils';

const CLICKS_PER_PAGE = 20;

interface ClickWithDetails extends Click {
  userDisplayName?: string;
  userEmail?: string;
}

function ClicksTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-1/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 7 }).map((_, index) => (
                  <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 7 }).map((_, colIndex) => (
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
  const [clicks, setClicks] = useState<ClickWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const [filterType, setFilterType] = useState<'all' | 'userId' | 'storeId' | 'clickId'>('all');
  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [userCache, setUserCache] = useState<Record<string, Pick<UserProfile, 'displayName' | 'email'>>>({});
  const [storeCache, setStoreCache] = useState<Record<string, Pick<Store, 'name'>>>({});


  const fetchClickDetails = useCallback(async (rawClicks: Click[]): Promise<ClickWithDetails[]> => {
    if (!db || firebaseInitializationError || rawClicks.length === 0) return rawClicks;

    const userIdsToFetch = [...new Set(rawClicks.map(c => c.userId).filter(id => id && !userCache[id]))];

    // Corrected logic for storeIdsToFetch
    const relevantClicksForStoreFetch = rawClicks.filter(
      click => click.storeId && !storeCache[click.storeId] && !click.storeName
    );
    const storeIdsToFetch = [...new Set(relevantClicksForStoreFetch.map(click => click.storeId!))];

    try {
      if (userIdsToFetch.length > 0) {
        const newUsers: Record<string, Pick<UserProfile, 'displayName' | 'email'>> = {};
        for (let i = 0; i < userIdsToFetch.length; i += 30) { // Firestore 'in' query limit is 30
          const chunk = userIdsToFetch.slice(i, i + 30);
          if (chunk.length === 0) continue;
          const usersQuery = query(collection(db, 'users'), where('__name__', 'in', chunk));
          const userSnaps = await getDocs(usersQuery);
          userSnaps.forEach(docSnap => {
            const data = docSnap.data();
            newUsers[docSnap.id] = { displayName: data.displayName || null, email: data.email || null };
          });
        }
        setUserCache(prev => ({ ...prev, ...newUsers }));
      }

      if (storeIdsToFetch.length > 0) {
        const newStores: Record<string, Pick<Store, 'name'>> = {};
        for (let i = 0; i < storeIdsToFetch.length; i += 30) { // Firestore 'in' query limit is 30
            const chunk = storeIdsToFetch.slice(i, i + 30);
            if (chunk.length === 0) continue;
            const storesQuery = query(collection(db, 'stores'), where('__name__', 'in', chunk));
            const storeSnaps = await getDocs(storesQuery);
            storeSnaps.forEach(docSnap => {
                const data = docSnap.data();
                newStores[docSnap.id] = { name: data.name || 'Unknown Store' };
            });
        }
        setStoreCache(prev => ({ ...prev, ...newStores }));
      }

    } catch (detailError) {
      console.error("Error fetching click details (users/stores):", detailError);
      toast({ variant: "destructive", title: "Detail Fetch Error", description: "Could not load some user/store names." });
    }

    return rawClicks.map(click => ({
      ...click,
      userDisplayName: userCache[click.userId]?.displayName || click.userId,
      userEmail: userCache[click.userId]?.email,
      storeName: click.storeName || storeCache[click.storeId]?.name || click.storeId,
    }));
  }, [userCache, storeCache, toast]);


  const fetchClicks = useCallback(async (
    loadMoreOperation = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    let isMounted = true;
    if (firebaseInitializationError || !db) {
      if(isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if(!loadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => {isMounted = false;};
    }

    if (!loadMoreOperation) {
      setLoading(true);
      setClicks([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      if (!docToStartAfter && loadMoreOperation) { // Check if docToStartAfter is null when trying to load more
        if(isMounted) setLoadingMore(false);
        return () => {isMounted = false;};
      }
      setLoadingMore(true);
    }
    if(!loadMoreOperation) setError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const clicksCollectionRef = collection(db, 'clicks');
      const constraints: QueryConstraint[] = [];

      if (debouncedSearchTerm && filterType !== 'all') {
        if (filterType === 'userId') constraints.push(where('userId', '==', debouncedSearchTerm));
        else if (filterType === 'storeId') constraints.push(where('storeId', '==', debouncedSearchTerm));
        else if (filterType === 'clickId') {
             const clickDocRef = doc(db, 'clicks', debouncedSearchTerm);
             const clickDocSnap = await getDoc(clickDocRef);
             if (clickDocSnap.exists() && isMounted) {
                 const clickData = {
                     id: clickDocSnap.id,
                     ...clickDocSnap.data(),
                     timestamp: safeToDate(clickDocSnap.data().timestamp as Timestamp | undefined) || new Date(0),
                 } as Click;
                 const detailedClick = await fetchClickDetails([clickData]);
                 setClicks(detailedClick);
                 setHasMore(false);
                 setLoading(false);
                 setLoadingMore(false);
                 setIsSearching(false);
                 return () => {isMounted = false;};
             } else if(isMounted) {
                 setClicks([]);
                 setHasMore(false);
                 setLoading(false);
                 setLoadingMore(false);
                 setIsSearching(false);
                 return () => {isMounted = false;};
             }
             // Explicitly return here to avoid further query execution if clickId is used
             return () => {isMounted = false;};
        }
      }
      
      constraints.push(orderBy('timestamp', 'desc'));

      if (loadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(CLICKS_PER_PAGE));

      const q = query(clicksCollectionRef, ...constraints);
      const querySnapshot = await getDocs(q);

      const rawClicksData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        timestamp: safeToDate(docSnap.data().timestamp as Timestamp | undefined) || new Date(0),
      } as Click));

      let filteredClicks = rawClicksData;
      if (debouncedSearchTerm && filterType === 'all') { 
         filteredClicks = rawClicksData.filter(click =>
            (click.storeName && click.storeName.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
            (click.affiliateLink && click.affiliateLink.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
            (click.productName && click.productName.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
            (click.userId && click.userId.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
            (click.clickId && click.clickId.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
          );
      }

      const clicksWithDetails = await fetchClickDetails(filteredClicks);

      if(isMounted){
        setClicks(prev => loadMoreOperation ? [...prev, ...clicksWithDetails] : clicksWithDetails);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === CLICKS_PER_PAGE && clicksWithDetails.length > 0);
      }

    } catch (err) {
      console.error("Error fetching clicks:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch clicks";
      if(isMounted) {
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if(isMounted){
        setLoading(false);
        setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => {isMounted = false;};
  }, [debouncedSearchTerm, filterType, toast, fetchClickDetails]);

  useEffect(() => {
    const cleanup = fetchClicks(false, null);
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm]); 

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchClicks(true, lastVisible);
    }
  };

  if (loading && clicks.length === 0 && !error) {
    return <AdminGuard><ClicksTableSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
            <MousePointerClick className="w-7 h-7"/> Click Logs
        </h1>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter & Search Clicks</CardTitle>
            <CardDescription>Search by User ID, Store ID, Click ID, or general terms.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-auto">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as 'all' | 'userId' | 'storeId' | 'clickId')}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fields</SelectItem>
                  <SelectItem value="userId">User ID</SelectItem>
                  <SelectItem value="storeId">Store ID</SelectItem>
                  <SelectItem value="clickId">Click ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <Input
                type="search"
                placeholder={
                    filterType === 'all' ? "Search store, product, user, click ID..." :
                    filterType === 'userId' ? "Enter User ID..." :
                    filterType === 'storeId' ? "Enter Store ID..." :
                    filterType === 'clickId' ? "Enter Click ID..." : "Search..."
                }
                value={searchTermInput}
                onChange={(e) => setSearchTermInput(e.target.value)}
                disabled={isSearching || loading}
                className="h-10 text-base"
              />
              <Button type="submit" disabled={isSearching || loading} className="h-10">
                {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Click Log List</CardTitle>
            <CardDescription>Detailed record of user clicks on affiliate links.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && clicks.length === 0 && !error ? (
              <ClicksTableSkeleton />
            ) : !loading && clicks.length === 0 && !error ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm ? `No clicks found matching "${debouncedSearchTerm}".` : "No clicks recorded yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Item Clicked</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Affiliate Link</TableHead>
                      <TableHead>User Agent</TableHead>
                      <TableHead className="text-right">Click ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clicks.map((click) => (
                      <TableRow key={click.id}>
                        <TableCell>
                            <div className="font-medium truncate max-w-[150px]" title={click.userDisplayName || click.userId}>{click.userDisplayName || click.userId}</div>
                            {click.userEmail && <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={click.userEmail}>{click.userEmail}</div>}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[150px]" title={click.storeName || click.storeId}>{click.storeName || click.storeId}</TableCell>
                        <TableCell className="truncate max-w-[200px]" title={click.productId ? `Product: ${click.productName || click.productId}` : click.couponId ? `Coupon ID: ${click.couponId}` : 'Store Link'}>
                          {click.productId ? `Product: ${click.productName || click.productId}` :
                           click.couponId ? `Coupon: ${click.couponId}` : 
                           'Store Link'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs">
                            <a href={click.affiliateLink} target="_blank" rel="noopener noreferrer" title={click.affiliateLink} className="truncate block max-w-[200px]">
                              {click.affiliateLink || 'N/A'} <ExternalLink className="h-3 w-3 ml-1 inline-block align-middle"/>
                            </a>
                          </Button>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]" title={click.userAgent || undefined}>{click.userAgent || 'N/A'}</TableCell>
                        <TableCell className="font-mono text-xs text-right truncate max-w-[100px]" title={click.clickId}>{click.clickId}</TableCell>
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
    </AdminGuard>
  );
}
    
