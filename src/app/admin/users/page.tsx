// src/app/admin/users/page.tsx
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
  doc,
  updateDoc,
  serverTimestamp,
  where,
  QueryConstraint,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { UserProfile } from '@/lib/types'; // Ensure UserProfile type is defined
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
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2, Search, CheckCircle, XCircle, UserCheck, UserX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard'; // Ensure page is protected
import { Switch } from '@/components/ui/switch'; // Import Switch
import { safeToDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth'; // Import useAuth to verify admin role

const USERS_PER_PAGE = 20;

// Helper function to map role to badge variant
const getRoleVariant = (role: 'user' | 'admin'): "default" | "secondary" => {
  switch (role) {
    case 'admin': return 'secondary'; // Or primary
    case 'user': return 'default';
    default: return 'default';
  }
};

function AdminUsersPageContent() {
  const { userProfile: adminProfile } = useAuth(); // Get admin's profile to confirm role
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  // Filtering and Searching State
  const [searchTerm, setSearchTerm] = useState(''); // For searching by Email or Name
  const [isSearching, setIsSearching] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null); // Track which user is being updated

  const fetchUsers = useCallback(async (loadMore = false, search = false) => {
    console.log(`ADMIN: Fetching users... Load more: ${loadMore}, Search: ${search}, Term: "${searchTerm}"`);
    const isInitialOrNewSearch = !loadMore;

    if (isInitialOrNewSearch) {
      setLoading(true);
      setLastVisible(null);
      setUsers([]);
      setHasMore(true); // Reset hasMore on new fetch/search
    } else {
      setLoadingMore(true);
    }
    setError(null); // Clear previous errors
    setIsSearching(search);

    if (!db) {
        console.error("ADMIN: Firestore not initialized.");
        setError("Database connection error.");
        setLoading(false);
        setLoadingMore(false);
        setIsSearching(false);
        return;
    }

    try {
      const usersCollection = collection(db, 'users');
      let constraints: QueryConstraint[] = [];

      // Basic Firestore search by email (case-sensitive prefix)
      if (search && searchTerm) {
        console.log(`ADMIN: Applying search constraints for term: ${searchTerm}`);
        // Attempt case-insensitive search (might require specific setup or won't be truly case-insensitive)
        const lowerCaseTerm = searchTerm.toLowerCase();
        const upperCaseTerm = searchTerm.toUpperCase(); // Less reliable
        // This is still limited in Firestore, often requires dedicated search service like Algolia
        constraints.push(where('email', '>=', searchTerm)); // Start with exact case
        constraints.push(where('email', '<=', searchTerm + '\uf8ff'));
         // Note: Name search is even harder without a search service.
         // You might need client-side filtering after fetching if name search is crucial.
      }

      // Apply ordering
      if (search && searchTerm) {
         constraints.push(orderBy('email')); // Order by email when searching for predictability
      } else {
         constraints.push(orderBy('createdAt', 'desc')); // Default order
      }

      // Apply pagination
      if (loadMore && lastVisible) {
        console.log("ADMIN: Adding startAfter constraint.");
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(USERS_PER_PAGE));

      console.log("ADMIN: Executing Firestore query with constraints:", constraints);
      const q = query(usersCollection, ...constraints);
      const querySnapshot = await getDocs(q);
      console.log(`ADMIN: Firestore query returned ${querySnapshot.size} documents.`);


      const usersData = querySnapshot.docs.map(docSnap => {
         const data = docSnap.data();
         // Robust data mapping with defaults
         const profile: UserProfile = {
           uid: docSnap.id,
           email: data.email ?? 'No Email', // Provide fallback
           displayName: data.displayName ?? 'No Name', // Provide fallback
           photoURL: data.photoURL ?? null,
           role: ['user', 'admin'].includes(data.role) ? data.role : 'user', // Validate role
           cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
           pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
           lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
           referralCode: data.referralCode ?? null,
           referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
           referralBonusEarned: typeof data.referralBonusEarned === 'number' ? data.referralBonusEarned : 0,
           referredBy: data.referredBy ?? null,
           isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
           createdAt: safeToDate(data.createdAt) || new Date(0), // Use epoch if null
           updatedAt: safeToDate(data.updatedAt) || new Date(0), // Use epoch if null
           lastPayoutRequestAt: safeToDate(data.lastPayoutRequestAt), // Can be null
           payoutDetails: data.payoutDetails ?? null,
         };
          // console.log("ADMIN: Mapped user:", profile.uid, profile.email); // Optional: Log mapped data
         return profile;
      });

      // Optional: Client-side filtering if name search is needed and not handled by Firestore query
      let finalUsersData = usersData;
      if (search && searchTerm && !constraints.some(c => c.toString().includes('displayName'))) { // Example check if query didn't include name
          // finalUsersData = usersData.filter(u => u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()));
          // console.log(`ADMIN: Applied client-side filter for name, ${finalUsersData.length} results remain.`);
      }


      if (loadMore) {
        setUsers(prev => [...prev, ...finalUsersData]);
      } else {
        setUsers(finalUsersData);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === USERS_PER_PAGE);
      console.log(`ADMIN: Fetch successful. Has more: ${querySnapshot.docs.length === USERS_PER_PAGE}`);

    } catch (err) {
      console.error("ADMIN: Error fetching users:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch users";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      setHasMore(false); // Stop pagination on error
    } finally {
       console.log("ADMIN: Setting loading states to false.");
      setLoading(false);
      setLoadingMore(false);
      setIsSearching(false);
    }
  }, [searchTerm, lastVisible, toast]);

  useEffect(() => {
     // Ensure admin role before fetching
     if (adminProfile && adminProfile.role === 'admin') {
         fetchUsers(false, false); // Initial fetch on mount or when admin role confirmed
     } else if (adminProfile && adminProfile.role !== 'admin'){
         setError("Access Denied: You do not have permission to view this page.");
         setLoading(false);
     }
     // If adminProfile is null (still loading auth), the loading state handles the UI
  }, [adminProfile, fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(false, true); // Fetch with search term, reset pagination
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchUsers(true, searchTerm !== ''); // Pass true for loadMore
    }
  };

  // --- Toggle User Disabled Status ---
  const handleToggleUserStatus = async (userToUpdate: UserProfile) => {
    if (!userToUpdate) return;
    if (adminProfile?.uid === userToUpdate.uid) {
        toast({ variant: "destructive", title: "Action Forbidden", description: "Administrators cannot disable their own account." });
        return;
    }

    setUpdatingUserId(userToUpdate.uid); // Indicate loading state

    const userDocRef = doc(db, 'users', userToUpdate.uid);
    const newStatus = !userToUpdate.isDisabled;

    try {
      await updateDoc(userDocRef, {
        isDisabled: newStatus,
        updatedAt: serverTimestamp(),
      });

      // Update local state immediately
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.uid === userToUpdate.uid ? { ...u, isDisabled: newStatus, updatedAt: new Date() } : u
        )
      );

      toast({
        title: `User ${newStatus ? 'Disabled' : 'Enabled'}`,
        description: `${userToUpdate.displayName || userToUpdate.email} status updated.`,
      });
    } catch (err) {
      console.error(`ADMIN: Error updating user ${userToUpdate.uid} status:`, err);
      const errorMsg = err instanceof Error ? err.message : "Could not update user status.";
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: errorMsg,
      });
    } finally {
      setUpdatingUserId(null); // Reset loading state
    }
  };


  // Initial loading state or error state
  if (loading && users.length === 0) {
    return <UsersTableSkeleton />;
  }

   // Handle case where admin role is not confirmed or access denied error
   if ((!loading && !adminProfile) || (adminProfile && adminProfile.role !== 'admin')) {
      return (
          <div className="container mx-auto p-4 md:p-8">
              <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Access Denied</AlertTitle>
                  <AlertDescription>
                     {error || "You do not have permission to access this page."}
                  </AlertDescription>
              </Alert>
          </div>
      );
   }


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Manage Users</h1>

      {error && !loading && ( // Show fetch errors only if not in initial loading state
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filtering and Searching Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
          <CardDescription>Search by Email.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Search by Email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isSearching || loading}
              className="h-10 text-base"
            />
            <Button type="submit" disabled={isSearching || loading} className="h-10">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>View and manage user accounts.</CardDescription>
        </CardHeader>
        <CardContent>
           {/* Show skeleton only during initial load when users array is empty */}
           {loading && users.length === 0 ? (
             <UsersTableSkeleton />
            // Show "No results" only after loading if search was performed and no users match
           ) : !loading && users.length === 0 && searchTerm ? (
             <p className="text-center text-muted-foreground py-8">No users found matching "{searchTerm}".</p>
            // Show "No users" only after loading if no search was performed and no users exist
           ) : !loading && users.length === 0 && !searchTerm ? (
              <p className="text-center text-muted-foreground py-8">No users found in the system.</p>
           ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((userProfile) => (
                    <TableRow key={userProfile.uid} className={userProfile.isDisabled ? 'opacity-50 bg-muted/30' : ''}>
                      <TableCell className="font-medium">{userProfile.displayName || 'N/A'}</TableCell>
                      <TableCell>{userProfile.email}</TableCell>
                      <TableCell>
                        <Badge variant={getRoleVariant(userProfile.role)}>{userProfile.role}</Badge>
                      </TableCell>
                      <TableCell>{userProfile.createdAt ? format(userProfile.createdAt, 'PP') : 'N/A'}</TableCell>
                      <TableCell>
                        {userProfile.isDisabled ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <UserX className="h-3 w-3" /> Disabled
                          </Badge>
                        ) : (
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                             <UserCheck className="h-3 w-3" /> Enabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                         <div className="flex items-center gap-2">
                             <Switch
                               checked={!userProfile.isDisabled}
                               onCheckedChange={() => handleToggleUserStatus(userProfile)}
                               disabled={updatingUserId === userProfile.uid || adminProfile?.uid === userProfile.uid} // Disable switch for self or while updating
                               aria-label={userProfile.isDisabled ? 'Enable user' : 'Disable user'}
                             />
                              {updatingUserId === userProfile.uid && <Loader2 className="h-4 w-4 animate-spin" />}
                         </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
           {hasMore && !loading && ( // Show only if more data exists and not in initial load
            <div className="mt-6 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More Users
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Skeleton Loader for the Table
function UsersTableSkeleton() {
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
              {Array.from({ length: 10 }).map((_, rowIndex) => (
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

export default function AdminUsersPage() {
    // Wrap the component with AdminGuard to ensure only admins can access it
    return (
      <AdminGuard>
        <AdminUsersPageContent />
      </AdminGuard>
    );
}
