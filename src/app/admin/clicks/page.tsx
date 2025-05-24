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
import { AlertCircle, Loader2, Search, ExternalLink, FileText, Tag, ShoppingCart, User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import { format } from 'date-fns';
import { useDebounce } from '@/hooks/use-debounce';
import { safeToDate, formatCurrency } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const ITEMS_PER_PAGE = 15;

interface CombinedClickData {
  click: Click;
  user?: UserProfile | null;
  conversion?: Conversion | null;
  store?: Store | null;
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
                {Array.from({ length: 10 }).map((_, index) => (
                  <TableHead key={index}><Skeleton className="h-5 w-full min-w-[120px]" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 10 }).map((_, colIndex) => (
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
  const [pageLoading, setPageLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisibleClick, setLastVisibleClick] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();

  const [filterType, setFilterType] = React.useState<'all' | 'userId' | 'storeId' | 'clickId' | 'orderId'>('all');
  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  // Cache for fetched details to avoid re-fetching
  const [userCache, setUserCache] = React.useState<Record<string, UserProfile>>({});
  const [storeCache, setStoreCache] = React.useState<Record<string, Store>>({});
  const [conversionCache, setConversionCache] = React.useState<Record<string, Conversion>>({});


  const fetchClickDetails = React.useCallback(async (clicksToEnrich: Click[]): Promise<CombinedClickData[]> => {
    if (firebaseInitializationError || !db) {
      console.error("ADMIN_CLICKS: Firestore not available for fetching details.");
      // Return clicks without enriched data if db is not available
      return clicksToEnrich.map(click => ({ click }));
    }

    const enrichedDataPromises = clicksToEnrich.map(async (click): Promise<CombinedClickData> => {
      let userProfile: UserProfile | null = userCache[click.userId || ''] || null;
      let storeData: Store | null = storeCache[click.storeId || ''] || null;
      let conversion: Conversion | null = conversionCache[click.clickId] || null; // Use click.clickId as key for conversionCache

      if (click.userId && !userProfile) {
        try {
          const userRef = doc(db, 'users', click.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            userProfile = { uid: userSnap.id, ...userSnap.data() } as UserProfile;
            setUserCache(prev => ({ ...prev, [click.userId!]: userProfile! }));
          }
        } catch (e) { console.warn(`Failed to fetch user ${click.userId}`, e); }
      }

      if (click.storeId && !storeData) {
        try {
          const storeRef = doc(db, 'stores', click.storeId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            storeData = { id: storeSnap.id, ...storeSnap.data() } as Store;
            setStoreCache(prev => ({ ...prev, [click.storeId!]: storeData! }));
          }
        } catch (e) { console.warn(`Failed to fetch store ${click.storeId}`, e); }
      }
      
      // Fetch conversion if not already cached and clickId exists
      if (click.clickId && !conversion) {
        try {
          const convQuery = query(collection(db, 'conversions'), where('clickId', '==', click.clickId), limit(1));
          const convSnap = await getDocs(convQuery);
          if (!convSnap.empty) {
            const convData = convSnap.docs[0].data();
            conversion = {
              id: convSnap.docs[0].id,
              ...convData,
              timestamp: safeToDate(convData.timestamp as Timestamp | undefined) || new Date(0),
            } as Conversion;
            setConversionCache(prev => ({ ...prev, [click.clickId]: conversion! }));
          }
        } catch (e) { console.warn(`Failed to fetch conversion for click ${click.clickId}`, e); }
      }

      return { click, user: userProfile, conversion, store: storeData };
    });

    return Promise.all(enrichedDataPromises);
  }, [userCache, storeCache, conversionCache]); // Dependencies for useCallback

  const fetchTrackingData = React.useCallback(async (
    loadMoreOperation = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    if (firebaseInitializationError || !db) {
      setPageError(firebaseInitializationError || "Database connection not available.");
      setPageLoading(false); setLoadingMore(false); setHasMore(false);
      return;
    }

    if (!loadMoreOperation) {
      setPageLoading(true); setCombinedData([]); setLastVisibleClick(null); setHasMore(true);
    } else {
      if (!docToStartAfter && loadMoreOperation) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }
    if (!loadMoreOperation) setPageError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const clicksCollectionRef = collection(db, 'clicks');
      const constraints: QueryConstraint[] = [];

      // Apply filters based on filterType and debouncedSearchTerm
      if (debouncedSearchTerm.trim() && filterType !== 'all') {
          if (filterType === 'clickId') {
              const clickDocRef = doc(db, 'clicks', debouncedSearchTerm.trim());
              const clickDocSnap = await getDoc(clickDocRef);
              if (clickDocSnap.exists()) {
                  const clickData = { id: clickDocSnap.id, ...clickDocSnap.data(), timestamp: safeToDate(clickDocSnap.data().timestamp as Timestamp | undefined) || new Date(0) } as Click;
                  const enrichedSingle = await fetchClickDetails([clickData]);
                  setCombinedData(enrichedSingle);
                  setHasMore(false);
              } else {
                  setCombinedData([]); setHasMore(false);
              }
              setPageLoading(false); setLoadingMore(false); setIsSearching(false);
              return;
          } else if (filterType === 'orderId') {
              const convQuery = query(collection(db, 'conversions'), where('orderId', '==', debouncedSearchTerm.trim()), limit(1));
              const convSnap = await getDocs(convQuery);
              if (!convSnap.empty) {
                  const convData = convSnap.docs[0].data() as Conversion;
                  if (convData.clickId) constraints.push(where('clickId', '==', convData.clickId));
                  else { setCombinedData([]); setHasMore(false); setPageLoading(false); setLoadingMore(false); setIsSearching(false); return; }
              } else { setCombinedData([]); setHasMore(false); setPageLoading(false); setLoadingMore(false); setIsSearching(false); return; }
          } else if (filterType === 'userId' || filterType === 'storeId') {
             constraints.push(where(filterType, '==', debouncedSearchTerm.trim()));
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
      
      const enrichedResults = await fetchClickDetails(fetchedClicks);
      
      let finalResults = enrichedResults;
      if (debouncedSearchTerm.trim() && filterType === 'all') {
        const lowerSearch = debouncedSearchTerm.toLowerCase();
        finalResults = enrichedResults.filter(item => 
          item.click.storeName?.toLowerCase().includes(lowerSearch) ||
          item.click.productName?.toLowerCase().includes(lowerSearch) ||
          item.user?.displayName?.toLowerCase().includes(lowerSearch) ||
          item.user?.email?.toLowerCase().includes(lowerSearch) ||
          item.conversion?.orderId?.toLowerCase().includes(lowerSearch) ||
          item.click.clickId?.toLowerCase().includes(lowerSearch)
        );
      }

      setCombinedData(prev => loadMoreOperation ? [...prev, ...finalResults] : finalResults);
      setLastVisibleClick(clickQuerySnapshot.docs[clickQuerySnapshot.docs.length - 1] || null);
      setHasMore(clickQuerySnapshot.docs.length === ITEMS_PER_PAGE && fetchedClicks.length > 0);

    } catch (err) {
      console.error("Error fetching tracking data:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch data";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      setHasMore(false);
    } finally {
      setPageLoading(false); setLoadingMore(false); setIsSearching(false);
    }
  }, [debouncedSearchTerm, filterType, toast, fetchClickDetails]);

  React.useEffect(() => {
    fetchTrackingData(false, null);
  }, [filterType, debouncedSearchTerm, fetchTrackingData]); // Added fetchTrackingData

  const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Fetching is handled by useEffect listening to debouncedSearchTerm and filterType
  };
  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisibleClick) {
      fetchTrackingData(true, lastVisibleClick);
    }
  };

  if (pageLoading && combinedData.length === 0 && !pageError) {
    return <AdminGuard><AdminClicksPageSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7"/> Tracking Overview (Clicks & Conversions)
        </h1>

        {pageError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" /> <AlertTitle>Error</AlertTitle> <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter & Search</CardTitle>
            <CardDescription>Search by various IDs or general terms if 'All Fields' is selected.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="w-full sm:w-auto flex-shrink-0">
              <Label htmlFor="filterTypeSel" className="sr-only">Filter By</Label>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
                <SelectTrigger id="filterTypeSel" className="h-10"><SelectValue placeholder="Filter by..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fields (General Search)</SelectItem>
                  <SelectItem value="clickId">Click ID</SelectItem>
                  <SelectItem value="userId">User ID</SelectItem>
                  <SelectItem value="storeId">Store ID</SelectItem>
                  <SelectItem value="orderId">Order ID (from Conversion)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 w-full sm:w-auto">
              <Input
                type="search"
                placeholder={
                    filterType === 'all' ? "Search user, store, product, click, order..." :
                    `Enter ${filterType.replace('Id', ' ID')}...`
                }
                value={searchTermInput}
                onChange={(e) => setSearchTermInput(e.target.value)}
                disabled={isSearching || pageLoading}
                className="h-10 text-base"
              />
              <Button type="submit" disabled={isSearching || pageLoading} className="h-10">
                {isSearching || (pageLoading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
            {pageLoading && combinedData.length === 0 && !pageError ? (
              <AdminClicksPageSkeleton />
            ) : !pageLoading && combinedData.length === 0 && !pageError ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm ? `No tracking data found matching "${debouncedSearchTerm}" with filter "${filterType}".` : "No tracking data recorded yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1200px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">User</TableHead>
                      <TableHead className="w-[150px]">Click Info</TableHead>
                      <TableHead className="w-[180px]">Item Clicked</TableHead>
                      <TableHead className="w-[150px]">Store</TableHead>
                      <TableHead className="w-[180px]">Clicked At</TableHead>
                      <TableHead className="w-[150px]">Purchase Status</TableHead>
                      <TableHead className="w-[180px]">Conversion Details</TableHead>
                      <TableHead className="text-right w-[200px]">Affiliate Link</TableHead>
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
                            <span className="text-xs text-muted-foreground">UID: {click.userId}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Guest</span>
                          )}
                        </TableCell>
                        <TableCell>
                           <div className="font-mono text-xs truncate max-w-[120px]" title={click.clickId}>ID: {click.clickId}</div>
                        </TableCell>
                        <TableCell className="truncate max-w-[180px]" title={click.productId ? `Product: ${click.productName || click.productId}` : click.couponId ? `Coupon: ${click.couponId}` : 'Store Visit'}>
                          {click.productId ? <><ShoppingCart className="inline-block mr-1 h-3 w-3 text-muted-foreground" /> {click.productName || click.productId}</> :
                           click.couponId ? <><Tag className="inline-block mr-1 h-3 w-3 text-muted-foreground" /> Coupon Click</> : 
                           'Store Page Visit'}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[150px]" title={store?.name || click.storeName || click.storeId || 'N/A'}>
                           {store?.name || click.storeName || click.storeId || 'N/A'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {click.timestamp ? format(new Date(click.timestamp), 'PPp') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {conversion ? (
                            <Badge variant={conversion.status === 'received' || conversion.status === 'processed' ? 'default' : conversion.status === 'unmatched_click' ? 'secondary' : 'outline'} className="text-[10px] capitalize">
                              Converted
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">No Conversion</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {conversion ? (
                            <div>
                              <div className="font-mono text-xs truncate max-w-[120px]" title={`Order ID: ${conversion.orderId}`}>OID: {conversion.orderId}</div>
                              <div className="text-xs" title={`Sale: ${formatCurrency(conversion.saleAmount)}`}>Sale: {formatCurrency(conversion.saleAmount)}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                 {conversion.timestamp ? format(new Date(conversion.timestamp), 'Pp') : 'N/A'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs">
                                    <a href={click.affiliateLink || '#'} target="_blank" rel="noopener noreferrer" className="truncate block max-w-[200px]">
                                      View Link <ExternalLink className="h-3 w-3 ml-1 inline-block align-middle"/>
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-md break-all">{click.affiliateLink || 'No Link'}</p>
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
            {hasMore && !pageLoading && combinedData.length > 0 && (
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
