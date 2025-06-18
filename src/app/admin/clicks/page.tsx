
// src/app/admin/clicks/page.tsx
"use client";

import * as React from 'react';
import {
  collection,
  query,
  orderBy,
  startAfter,
  limit,
  getDocs,
  doc,
  getDoc,
  where,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  Timestamp, // Value import
  type Firestore, // Type import
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Click, Conversion, UserProfile, Store } from '@/lib/types'; // Ensure all types are imported
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
import { AlertCircle, Loader2, Search, ExternalLink, FileText, ShoppingCart, Tag, User as UserIconLucide, CheckCircle, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import { format } from 'date-fns';
import { useDebounce } from '@/hooks/use-debounce';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const ITEMS_PER_PAGE = 15;
const ADMIN_CLICKS_LOG_PREFIX = "ADMIN_CLICKS_PAGE:";

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

  const fetchClickDetails = React.useCallback(async (clicksToEnrich: Click[]): Promise<CombinedClickData[]> => {
    console.log(`${ADMIN_CLICKS_LOG_PREFIX} fetchClickDetails called for ${clicksToEnrich.length} clicks.`);
    
    const enrichedDataPromises = clicksToEnrich.map(async (click): Promise<CombinedClickData> => {
      let userProfile: UserProfile | null = null;
      let storeDataFromDetails: Store | null = null;
      let conversion: Conversion | null = null;

      if (!db || firebaseInitializationError) {
        console.warn(`${ADMIN_CLICKS_LOG_PREFIX} Firestore not available for fetching details for click ${click.id}. Error: ${firebaseInitializationError}`);
        return { click, user: null, conversion: null, store: null };
      }
      const firestoreDb = db as Firestore; // Type assertion after check

      // Fetch User Profile
      if (click.userId) {
        try {
          const userRef = doc(firestoreDb, 'users', click.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            userProfile = { 
              uid: userSnap.id, ...data,
              createdAt: data.createdAt as Timestamp, 
              updatedAt: data.updatedAt as Timestamp,
              lastPayoutRequestAt: data.lastPayoutRequestAt instanceof Timestamp ? data.lastPayoutRequestAt : null,
            } as UserProfile;
          }
        } catch (e) { console.warn(`${ADMIN_CLICKS_LOG_PREFIX} Failed to fetch user ${click.userId}`, e); }
      }

      // Fetch Store Details (if not already present in click.storeName - often click only has storeId)
      if (click.storeId && !click.storeName) { // Only fetch if storeName is missing
        try {
          const storeRef = doc(firestoreDb, 'stores', click.storeId);
          const storeSnap = await getDoc(storeRef);
          if (storeSnap.exists()) {
            const data = storeSnap.data();
            storeDataFromDetails = { 
              id: storeSnap.id, ...data,
              createdAt: data.createdAt as Timestamp,
              updatedAt: data.updatedAt as Timestamp,
            } as Store;
          }
        } catch (e) { console.warn(`${ADMIN_CLICKS_LOG_PREFIX} Failed to fetch store ${click.storeId}`, e); }
      }

      // Fetch Conversion
      // Use click.clickId (the UUID field) to find the conversion, not click.id (Firestore document ID)
      if (click.clickId) { 
        try {
          const convQuery = query(collection(firestoreDb, 'conversions'), where('clickId', '==', click.clickId), limit(1));
          const convSnap = await getDocs(convQuery);
          if (!convSnap.empty) {
            const convDoc = convSnap.docs[0];
            const convData = convDoc.data();
            conversion = {
              id: convDoc.id,
              clickId: convData.clickId,
              originalClickFirebaseId: convData.originalClickFirebaseId || null,
              userId: convData.userId || null,
              storeId: convData.storeId || null,
              storeName: convData.storeName || null,
              orderId: convData.orderId,
              saleAmount: typeof convData.saleAmount === 'number' ? convData.saleAmount : 0,
              currency: convData.currency || 'INR',
              commissionAmount: convData.commissionAmount ?? null,
              status: (convData.status || 'unknown_status') as Conversion['status'],
              timestamp: convData.timestamp as Timestamp, // Expect Timestamp from Firestore
              postbackData: convData.postbackData || null,
              processingError: convData.processingError || null,
            };
          }
        } catch (e) { console.warn(`${ADMIN_CLICKS_LOG_PREFIX} Failed to fetch conversion for clickId ${click.clickId}`, e); }
      }
      return { click, user: userProfile, conversion, store: storeDataFromDetails };
    });

    return Promise.all(enrichedDataPromises);
  }, []);


  const fetchTrackingData = React.useCallback(async (
    loadMoreOperation = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    console.log(`${ADMIN_CLICKS_LOG_PREFIX} fetchTrackingData: loadMore=${loadMoreOperation}, term='${debouncedSearchTerm}', filter='${filterType}'`);
    if (!db || firebaseInitializationError) {
      setPageError(firebaseInitializationError || "DB error in fetchTrackingData.");
      setPageLoading(false); setLoadingMore(false); setHasMore(false);
      return;
    }
    const firestoreDb = db as Firestore;

    if (!loadMoreOperation) {
      setPageLoading(true); setCombinedData([]); setLastVisibleClick(null); setHasMore(true);
    } else {
      if (!docToStartAfter && loadMoreOperation) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }
    if (!loadMoreOperation) setPageError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const clicksCollectionRef = collection(firestoreDb, 'clicks');
      let constraints: QueryConstraint[] = [];

      if (debouncedSearchTerm.trim() && filterType !== 'all') {
        if (filterType === 'clickId') { // Search by click.clickId (the UUID field)
          constraints.push(where('clickId', '==', debouncedSearchTerm.trim()));
        } else if (filterType === 'orderId') {
          // First find conversion by orderId, then find click by the conversion's clickId
          const convSearchQuery = query(collection(firestoreDb, 'conversions'), where('orderId', '==', debouncedSearchTerm.trim()), limit(1));
          const convSearchSnap = await getDocs(convSearchQuery);
          if (!convSearchSnap.empty) {
            const convData = convSearchSnap.docs[0].data() as Conversion;
            if (convData.clickId) { // Use the clickId from the conversion to find the click
              constraints.push(where('clickId', '==', convData.clickId));
            } else { 
              setCombinedData([]); setHasMore(false); setPageLoading(false); setLoadingMore(false); setIsSearching(false); return; 
            }
          } else { 
            setCombinedData([]); setHasMore(false); setPageLoading(false); setLoadingMore(false); setIsSearching(false); return; 
          }
        } else if (filterType === 'userId' || filterType === 'storeId') {
          constraints.push(where(filterType, '==', debouncedSearchTerm.trim()));
        }
      }

      constraints.push(orderBy('timestamp', 'desc'));
      if (loadMoreOperation && docToStartAfter) constraints.push(startAfter(docToStartAfter));
      constraints.push(limit(ITEMS_PER_PAGE));

      const q = query(clicksCollectionRef, ...constraints);
      const clickQuerySnapshot = await getDocs(q);
      console.log(`${ADMIN_CLICKS_LOG_PREFIX} Firestore query executed, got ${clickQuerySnapshot.size} click docs.`);

      const fetchedClicks = clickQuerySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id, ...data,
          timestamp: data.timestamp as Timestamp, // Expect Timestamp from Firestore
        } as Click;
      });
      
      const enrichedResults = await fetchClickDetails(fetchedClicks);
      console.log(`${ADMIN_CLICKS_LOG_PREFIX} Enriched ${enrichedResults.length} clicks.`);

      let finalResults = enrichedResults;
      if (debouncedSearchTerm.trim() && filterType === 'all') {
        const lowerSearch = debouncedSearchTerm.toLowerCase();
        finalResults = enrichedResults.filter(item =>
          item.click.storeName?.toLowerCase().includes(lowerSearch) ||
          item.store?.name?.toLowerCase().includes(lowerSearch) ||
          item.click.productName?.toLowerCase().includes(lowerSearch) ||
          item.user?.displayName?.toLowerCase().includes(lowerSearch) ||
          item.user?.email?.toLowerCase().includes(lowerSearch) ||
          item.conversion?.orderId?.toLowerCase().includes(lowerSearch) ||
          (item.click.clickId && item.click.clickId.toLowerCase().includes(lowerSearch))
        );
      }
      setCombinedData(prev => loadMoreOperation ? [...prev, ...finalResults] : finalResults);
      setLastVisibleClick(clickQuerySnapshot.docs[clickQuerySnapshot.docs.length - 1] || null);
      setHasMore(clickQuerySnapshot.docs.length === ITEMS_PER_PAGE && fetchedClicks.length > 0);
      console.log(`${ADMIN_CLICKS_LOG_PREFIX} State updated. HasMore: ${clickQuerySnapshot.docs.length === ITEMS_PER_PAGE && fetchedClicks.length > 0}`);

    } catch (err) {
      console.error(`${ADMIN_CLICKS_LOG_PREFIX} Error fetching tracking data:`, err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch data";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      setHasMore(false);
    } finally {
      setPageLoading(false); setLoadingMore(false); setIsSearching(false);
      console.log(`${ADMIN_CLICKS_LOG_PREFIX} fetchTrackingData finished. pageLoading: false, loadingMore: false.`);
    }
  }, [debouncedSearchTerm, filterType, toast, fetchClickDetails]);

  React.useEffect(() => {
    // Initial fetch
    fetchTrackingData(false, null);
  }, [filterType, debouncedSearchTerm, fetchTrackingData]); // Re-fetch if filter or search term changes


  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // fetchTrackingData is called by useEffect due to debouncedSearchTerm change
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
              <label htmlFor="filterTypeSelClicksAdmin" className="sr-only">Filter By</label>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
                <SelectTrigger id="filterTypeSelClicksAdmin" className="h-10"><SelectValue placeholder="Filter by..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fields (General Search)</SelectItem>
                  <SelectItem value="clickId">Click ID (Original UUID)</SelectItem>
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
                <Table className="min-w-[1400px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">User</TableHead>
                      <TableHead className="min-w-[150px]">Click ID (Doc ID)</TableHead>
                      <TableHead className="min-w-[180px]">Item Clicked</TableHead>
                      <TableHead className="min-w-[150px]">Store</TableHead>
                      <TableHead className="min-w-[180px]">Clicked At</TableHead>
                      <TableHead className="min-w-[150px]">Purchase Status</TableHead>
                      <TableHead className="min-w-[180px]">Conversion Details</TableHead>
                      <TableHead className="min-w-[120px]">Conv. Status</TableHead>
                      <TableHead className="text-right min-w-[200px]">Affiliate Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedData.map(({ click, user, conversion, store: storeFromDetails }) => {
                       const displayStoreName = click.storeName || storeFromDetails?.name || click.storeId || 'N/A';
                       const clickTimestamp = safeToDate(click.timestamp);
                       const conversionTimestamp = conversion?.timestamp ? safeToDate(conversion.timestamp) : null;

                       return (
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
                              <div className="font-mono text-xs truncate max-w-[120px]" title={click.clickId || undefined}>{click.clickId ? `${click.clickId}`: 'N/A'}</div>
                              <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={click.id || undefined}>Doc: {click.id}</div>
                            </TableCell>
                            <TableCell className="truncate max-w-[180px]" title={click.productId ? `Product: ${click.productName || click.productId}` : click.couponId ? `Coupon ID: ${click.couponId}` : 'Store Page Visit'}>
                              {click.productId ? <><ShoppingCart className="inline-block mr-1 h-3 w-3 text-muted-foreground" /> {click.productName || click.productId}</> :
                              click.couponId ? <><Tag className="inline-block mr-1 h-3 w-3 text-muted-foreground" /> Coupon: {click.couponId}</> :
                              'Store Page Visit'}
                            </TableCell>
                            <TableCell className="font-medium truncate max-w-[150px]" title={displayStoreName}>
                              {displayStoreName}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {clickTimestamp ? format(clickTimestamp, 'PPp') : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {conversion ? (
                                  <Badge variant="default" className="text-[10px] bg-green-100 text-green-700 border-green-300">
                                    <CheckCircle className="mr-1 h-3 w-3" /> Converted
                                  </Badge>
                              ) : (
                                  <Badge variant="outline" className="text-[10px]"> <XCircle className="mr-1 h-3 w-3 text-destructive"/> No Conversion</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {conversion ? (
                                  <div>
                                    <div className="font-mono text-xs truncate max-w-[120px]" title={`Order ID: ${conversion.orderId}`}>OID: {conversion.orderId}</div>
                                    <div className="text-xs" title={`Sale: ${formatCurrency(conversion.saleAmount)}`}>Sale: {formatCurrency(conversion.saleAmount)}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                        {conversionTimestamp ? format(conversionTimestamp, 'Pp') : 'N/A'}
                                    </div>
                                  </div>
                              ) : (
                                  <span className="text-xs text-muted-foreground italic">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                                {conversion ? (
                                    <Badge variant={conversion.status === 'received' ? 'secondary' : conversion.status === 'unmatched_click' ? 'outline' : 'default'} className="text-[10px] capitalize">
                                        {conversion.status.replace('_', ' ')}
                                    </Badge>
                                ) : '-'}
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
                       );
                    })}
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
