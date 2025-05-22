
"use client";

import * as React from 'react';
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
import type { Click, Conversion, UserProfile, Store } from '@/lib/types';
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
import { AlertCircle, Loader2, Search, ExternalLink, MousePointerClick, User as UserIcon, ShoppingCart, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import { format } from 'date-fns';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate, formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ITEMS_PER_PAGE = 15;

interface CombinedClickData {
  click: Click;
  user?: UserProfile | null;
  conversion?: Conversion | null;
  store?: Store | null; // Store related to the click
}

function AdminClicksPageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-1/2 mb-1" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 9 }).map((_, index) => (
                  <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 9 }).map((_, colIndex) => (
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
  const [combinedData, setCombinedData] = React.useState<CombinedClickData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastVisibleClick, setLastVisibleClick] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();

  const [filterType, setFilterType] = React.useState<'all' | 'userId' | 'storeId' | 'clickId' | 'orderId'>('all');
  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  const fetchTrackingData = React.useCallback(async (
    loadMoreOperation = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    let isMounted = true;
    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        setLoading(false); setLoadingMore(false); setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!loadMoreOperation) {
      setLoading(true); setCombinedData([]); setLastVisibleClick(null); setHasMore(true);
    } else {
      if (!docToStartAfter) { if (isMounted) setLoadingMore(false); return () => { isMounted = false; }; }
      setLoadingMore(true);
    }
    if (!loadMoreOperation) setError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const clicksCollectionRef = collection(db, 'clicks');
      const constraints: QueryConstraint[] = [];

      if (debouncedSearchTerm && filterType !== 'all') {
        if (filterType === 'clickId') {
          // Direct fetch for a single clickId
          const clickDocRef = doc(db, 'clicks', debouncedSearchTerm);
          const clickDocSnap = await getDoc(clickDocRef);
          if (clickDocSnap.exists() && isMounted) {
            const clickData = { id: clickDocSnap.id, ...clickDocSnap.data(), timestamp: safeToDate(clickDocSnap.data().timestamp as Timestamp | undefined) || new Date(0) } as Click;
            
            let userProfile: UserProfile | null = null;
            if (clickData.userId) userProfile = (await getDoc(doc(db, 'users', clickData.userId))).data() as UserProfile || null;
            
            let conversion: Conversion | null = null;
            const convQuery = query(collection(db, 'conversions'), where('clickId', '==', clickData.clickId), limit(1));
            const convSnap = await getDocs(convQuery);
            if (!convSnap.empty) conversion = { id: convSnap.docs[0].id, ...convSnap.docs[0].data(), timestamp: safeToDate(convSnap.docs[0].data().timestamp as Timestamp | undefined) || new Date(0) } as Conversion;

            let storeData: Store | null = null;
            if(clickData.storeId) storeData = (await getDoc(doc(db, 'stores', clickData.storeId))).data() as Store || null;

            setCombinedData([{ click: clickData, user: userProfile, conversion, store: storeData }]);
            setHasMore(false); setLoading(false); setLoadingMore(false); setIsSearching(false);
            return () => { isMounted = false; };
          } else if (isMounted) {
            setCombinedData([]); setHasMore(false); setLoading(false); setLoadingMore(false); setIsSearching(false);
            return () => { isMounted = false; };
          }
        } else if (filterType === 'orderId') {
          const convQuery = query(collection(db, 'conversions'), where('orderId', '==', debouncedSearchTerm), limit(1));
          const convSnap = await getDocs(convQuery);
          if (!convSnap.empty) {
            const convData = convSnap.docs[0].data() as Conversion;
            if (convData.clickId) constraints.push(where('clickId', '==', convData.clickId));
            else { // No associated clickId from conversion, so no clicks to show for this orderId
              setCombinedData([]); setHasMore(false); setLoading(false); setLoadingMore(false); setIsSearching(false);
              return () => { isMounted = false; };
            }
          } else { // No conversion found for this orderId
            setCombinedData([]); setHasMore(false); setLoading(false); setLoadingMore(false); setIsSearching(false);
            return () => { isMounted = false; };
          }
        } else if (filterType === 'userId' || filterType === 'storeId') {
           constraints.push(where(filterType, '==', debouncedSearchTerm));
        }
      }
      
      constraints.push(orderBy('timestamp', 'desc'));
      if (loadMoreOperation && docToStartAfter) constraints.push(startAfter(docToStartAfter));
      constraints.push(limit(ITEMS_PER_PAGE));

      const q = query(clicksCollectionRef, ...constraints);
      const clickQuerySnapshot = await getDocs(q);

      const fetchedClicks = clickQuerySnapshot.docs.map(docSnap => ({
        id: docSnap.id, ...docSnap.data(), timestamp: safeToDate(docSnap.data().timestamp as Timestamp | undefined) || new Date(0),
      } as Click));
      
      let enrichedDataPromises = fetchedClicks.map(async (click) => {
        let userProfile: UserProfile | null = null;
        if (click.userId) {
          const userRef = doc(db, 'users', click.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) userProfile = { uid: userSnap.id, ...userSnap.data() } as UserProfile;
        }

        let conversion: Conversion | null = null;
        const convQuery = query(collection(db, 'conversions'), where('clickId', '==', click.clickId), limit(1));
        const convSnap = await getDocs(convQuery);
        if (!convSnap.empty) {
            const convData = convSnap.docs[0].data();
            conversion = { id: convSnap.docs[0].id, ...convData, timestamp: safeToDate(convData.timestamp as Timestamp | undefined) || new Date(0) } as Conversion;
        }

        let storeData: Store | null = null;
        if(click.storeId) {
            const storeRef = doc(db, 'stores', click.storeId);
            const storeSnap = await getDoc(storeRef);
            if(storeSnap.exists()) storeData = {id: storeSnap.id, ...storeSnap.data()} as Store;
        }

        return { click, user: userProfile, conversion, store: storeData };
      });

      const combinedResults = await Promise.all(enrichedDataPromises);
      
      if (isMounted) {
        // If general text search, client-side filter
        let finalResults = combinedResults;
        if (debouncedSearchTerm && filterType === 'all') {
          const lowerSearch = debouncedSearchTerm.toLowerCase();
          finalResults = combinedResults.filter(item => 
            item.click.storeName?.toLowerCase().includes(lowerSearch) ||
            item.click.productName?.toLowerCase().includes(lowerSearch) ||
            item.user?.displayName?.toLowerCase().includes(lowerSearch) ||
            item.user?.email?.toLowerCase().includes(lowerSearch) ||
            item.conversion?.orderId?.toLowerCase().includes(lowerSearch)
          );
        }
        setCombinedData(prev => loadMoreOperation ? [...prev, ...finalResults] : finalResults);
        setLastVisibleClick(clickQuerySnapshot.docs[clickQuerySnapshot.docs.length - 1] || null);
        setHasMore(clickQuerySnapshot.docs.length === ITEMS_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching tracking data:", err);
      if (isMounted) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        setLoading(false); setLoadingMore(false); setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [debouncedSearchTerm, filterType, toast]);

  React.useEffect(() => {
    fetchTrackingData(false, null);
  }, [debouncedSearchTerm, filterType, fetchTrackingData]);

  const handleSearchSubmit = (e: React.FormEvent) => e.preventDefault();
  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisibleClick) {
      fetchTrackingData(true, lastVisibleClick);
    }
  };

  if (loading && combinedData.length === 0 && !error) {
    return <AdminGuard><AdminClicksPageSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7"/> Tracking Overview (Clicks & Conversions)
        </h1>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" /> <AlertTitle>Error</AlertTitle> <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter & Search</CardTitle>
            <CardDescription>Search by various IDs or general terms.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-auto">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
                <SelectTrigger><SelectValue placeholder="Filter by..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fields (General Search)</SelectItem>
                  <SelectItem value="clickId">Click ID</SelectItem>
                  <SelectItem value="userId">User ID</SelectItem>
                  <SelectItem value="storeId">Store ID</SelectItem>
                  <SelectItem value="orderId">Order ID (from Conversion)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <Input
                type="search"
                placeholder={
                    filterType === 'all' ? "Search user, store, product, click, order..." :
                    `Enter ${filterType.replace('Id', ' ID')}...`
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
            <CardTitle>Tracking Log</CardTitle>
            <CardDescription>Detailed record of user clicks and associated conversions.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && combinedData.length === 0 && !error ? (
              <AdminClicksPageSkeleton />
            ) : !loading && combinedData.length === 0 && !error ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm ? `No tracking data found matching "${debouncedSearchTerm}".` : "No tracking data recorded yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1200px]"> {/* Added min-width */}
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Click Info</TableHead>
                      <TableHead>Item Clicked</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Clicked At</TableHead>
                      <TableHead>Conversion Details</TableHead>
                      <TableHead className="text-right">Affiliate Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedData.map(({ click, user, conversion, store }) => (
                      <TableRow key={click.id}>
                        <TableCell>
                          {user ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="font-medium truncate max-w-[150px]" title={user.displayName || user.uid}>
                                    {user.displayName || user.uid}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>UID: {user.uid}</p>
                                  {user.email && <p>Email: {user.email}</p>}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : click.userId ? (
                            <span className="text-xs text-muted-foreground">UID: {click.userId} (No profile)</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Guest</span>
                          )}
                        </TableCell>
                        <TableCell>
                           <div className="font-mono text-xs truncate max-w-[120px]" title={click.clickId}>ID: {click.clickId}</div>
                           {click.userAgent && <div className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={click.userAgent}>UA: Shortened</div>}
                        </TableCell>
                        <TableCell className="truncate max-w-[180px]" title={click.productId ? `Product: ${click.productName || click.productId}` : click.couponId ? `Coupon ID: ${click.couponId}` : 'Store Link'}>
                          {click.productId ? <><ShoppingCart className="inline-block mr-1 h-3 w-3" /> {click.productName || click.productId}</> :
                           click.couponId ? <><Tag className="inline-block mr-1 h-3 w-3" /> {click.couponId}</> : 
                           'Store Page Visit'}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[150px]" title={store?.name || click.storeName || click.storeId}>
                           {store?.name || click.storeName || click.storeId || 'N/A'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {conversion ? (
                            <div>
                              <div className="font-mono text-xs truncate max-w-[120px]" title={`Order ID: ${conversion.orderId}`}>OID: {conversion.orderId}</div>
                              <div className="text-xs" title={`Sale: ${formatCurrency(conversion.saleAmount)}`}>Sale: {formatCurrency(conversion.saleAmount)}</div>
                              <Badge variant={conversion.status === 'received' ? 'default' : conversion.status === 'unmatched_click' ? 'secondary' : 'outline'} className="text-[10px] capitalize mt-1">
                                {conversion.status.replace('_', ' ')}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No conversion</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs">
                                    <a href={click.affiliateLink} target="_blank" rel="noopener noreferrer" className="truncate block max-w-[200px]">
                                      View Link <ExternalLink className="h-3 w-3 ml-1 inline-block align-middle"/>
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-md break-all">{click.affiliateLink}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !loading && combinedData.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Data
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

