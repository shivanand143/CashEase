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
    if (!loadMore) {
      setLoading(true);
      setLastVisible(null);
      setUsers([]);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    setIsSearching(search);

    try {
      const usersCollection = collection(db, 'users');
      const constraints: QueryConstraint[] = [];

      // Apply searching (case-insensitive search needs specific backend logic or client-side filtering)
      // Basic Firestore search is limited. Here we search by email for simplicity.
      // For name search, consider a more robust search solution (Algolia, etc.) or client-side filter after fetch.
      if (search && searchTerm) {
        constraints.push(where('email', '>=', searchTerm.toLowerCase()));
        constraints.push(where('email', '<=', searchTerm.toLowerCase() + '\uf8ff'));
      }

      // Apply ordering and pagination
      constraints.push(orderBy('email')); // Order by email when searching
      if (!search) {
        constraints.push(orderBy('createdAt', 'desc')); // Default order by creation date
      }
      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(USERS_PER_PAGE));

      const q = query(usersCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const usersData = querySnapshot.docs.map(docSnap => {
         const data = docSnap.data();
         return {
           uid: docSnap.id,
           email: data.email ?? null,
           displayName: data.displayName ?? 'User',
           photoURL: data.photoURL ?? null,
           role: data.role ?? 'user',
           cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
           pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
           lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
           referralCode: data.referralCode ?? null,
           referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
           referralBonusEarned: typeof data.referralBonusEarned === 'number' ? data.referralBonusEarned : 0,
           referredBy: data.referredBy ?? null,
           isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
           createdAt: safeToDate(data.createdAt) || new Date(0),
           updatedAt: safeToDate(data.updatedAt) || new Date(0),
           lastPayoutRequestAt: safeToDate(data.lastPayoutRequestAt),
           payoutDetails: data.payoutDetails ?? null,
         } as UserProfile;
      });

      if (loadMore) {
        setUsers(prev => [...prev, ...usersData]);
      } else {
        setUsers(usersData);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === USERS_PER_PAGE);

    } catch (err) {
      console.error("Error fetching users:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch users";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsSearching(false);
    }
  }, [searchTerm, lastVisible, toast]); // Added toast

  useEffect(() => {
    fetchUsers(false, false); // Initial fetch on mount
  }, [fetchUsers]); // fetchUsers includes its dependencies

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(false, true); // Fetch with search term, reset pagination
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchUsers(true, searchTerm !== ''); // Pass true for loadMore, and true for search if searchTerm exists
    }
  };

  // --- Toggle User Disabled Status ---
  const handleToggleUserStatus = async (userToUpdate: UserProfile) => {
    if (!userToUpdate) return;
    setUpdatingUserId(userToUpdate.uid); // Indicate loading state for this specific user

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
          u.uid === userToUpdate.uid ? { ...u, isDisabled: newStatus, updatedAt: new Date() } : u // Estimate updatedAt
        )
      );

      toast({
        title: `User ${newStatus ? 'Disabled' : 'Enabled'}`,
        description: `${userToUpdate.displayName || userToUpdate.email} status updated.`,
      });
    } catch (err) {
      console.error(`Error updating user ${userToUpdate.uid} status:`, err);
      const errorMsg = err instanceof Error ? err.message : "Could not update user status.";
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: errorMsg,
      });
    } finally {
      setUpdatingUserId(null); // Reset loading state for this user
    }
  };


  if (loading && users.length === 0) {
    return <UsersTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Manage Users</h1>

      {error && (
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
          <CardDescription>Search by Email or Name.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Search by Email or Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isSearching}
              className="h-10 text-base"
            />
            <Button type="submit" disabled={isSearching} className="h-10">
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
           {loading && users.length === 0 ? (
             <UsersTableSkeleton />
           ) : users.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">No users found matching your criteria.</p>
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
                      <TableCell>{userProfile.createdAt ? format(new Date(userProfile.createdAt), 'PP') : 'N/A'}</TableCell>
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
                        <Switch
                          checked={!userProfile.isDisabled}
                          onCheckedChange={() => handleToggleUserStatus(userProfile)}
                          disabled={updatingUserId === userProfile.uid}
                          aria-label={userProfile.isDisabled ? 'Enable user' : 'Disable user'}
                        />
                         {updatingUserId === userProfile.uid && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
           {hasMore && (
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
    return (
      <AdminGuard>
        <AdminUsersPageContent />
      </AdminGuard>
    );
}
