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
import { db, firebaseInitializationError, auth as firebaseAuthService } from '@/lib/firebase/config'; // Ensure firebaseAuthService is correctly imported
import type { UserProfile } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from "@/hooks/use-toast";
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
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Search, Edit2, Ban, CheckCircle, ShieldCheck, User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useDebounce } from '@/hooks/use-debounce';
import AdminGuard from '@/components/guards/admin-guard';
import { safeToDate } from '@/lib/utils';

const USERS_PER_PAGE = 20;

function UsersTableSkeleton() {
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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();
  const { createOrUpdateUserProfile, fetchUserProfile } = useAuth();

  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  const fetchUsers = useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return;
    }

    if (!isLoadMoreOperation) {
      setLoading(true);
      setUsers([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    if (!isLoadMoreOperation) setError(null);
    setIsSearching(currentSearchTerm !== '');

    try {
      const usersCollection = collection(db, 'users');
      const constraints: QueryConstraint[] = [];

      if (currentSearchTerm) {
        // Basic search by email or displayName. For robust search, consider Algolia/Typesense.
        // This is a simplified approach; Firestore isn't ideal for full-text search.
        constraints.push(orderBy('email')); // Order by a field you search on
        constraints.push(where('email', '>=', currentSearchTerm));
        constraints.push(where('email', '<=', currentSearchTerm + '\uf8ff'));
        // Could add more where clauses for displayName if needed, but complex.
      } else {
        constraints.push(orderBy('createdAt', 'desc'));
      }

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(USERS_PER_PAGE));

      const q = query(usersCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const usersData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          uid: docSnap.id,
          ...data,
          createdAt: safeToDate(data.createdAt as Timestamp | undefined) || new Date(0),
          updatedAt: safeToDate(data.updatedAt as Timestamp | undefined) || new Date(0),
          lastPayoutRequestAt: safeToDate(data.lastPayoutRequestAt as Timestamp | undefined),
        } as UserProfile;
      });

      if (isMounted) {
        // If searching, filter more precisely client-side
        let finalUsers = usersData;
        if (currentSearchTerm) {
          finalUsers = usersData.filter(user =>
            user.email?.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
            user.displayName?.toLowerCase().includes(currentSearchTerm.toLowerCase())
          );
        }

        if (isLoadMoreOperation) {
          setUsers(prev => [...prev, ...finalUsers]);
        } else {
          setUsers(finalUsers);
        }
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        setLastVisible(newLastVisible);
        setHasMore(finalUsers.length === USERS_PER_PAGE && querySnapshot.docs.length === USERS_PER_PAGE); // More accurate hasMore
      }
    } catch (err) {
      console.error("Error fetching users:", err);
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch users";
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers(false, debouncedSearchTerm, null);
  }, [debouncedSearchTerm, fetchUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => e.preventDefault();

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchUsers(true, debouncedSearchTerm, lastVisible);
    }
  };

  const openEditDialog = (user: UserProfile) => {
    setEditingUser(user);
    setNewRole(user.role);
  };

  const handleSaveRole = async () => {
    if (!editingUser || !db || !firebaseAuthService) return;
    setIsSaving(true);
    try {
      // Fetch the Firebase Auth user to pass to createOrUpdateUserProfile
      // This step is a bit indirect; ideally, you'd have a dedicated admin SDK function
      // to update roles. But using existing createOrUpdateUserProfile for consistency.
      // Note: This won't work if the admin is trying to change their OWN role via this UI.
      // For robust role management, Firebase Admin SDK in a backend function is better.

      // For client-side updates of specific fields like 'role' by an admin:
      const userDocRef = doc(db, 'users', editingUser.uid);
      await updateDoc(userDocRef, {
        role: newRole,
        updatedAt: serverTimestamp()
      });

      setUsers(prev => prev.map(u => u.uid === editingUser.uid ? { ...u, role: newRole, updatedAt: new Date() } : u));
      toast({ title: "User Role Updated", description: `${editingUser.displayName || editingUser.email}'s role set to ${newRole}.` });
      setEditingUser(null);
    } catch (err) {
      console.error("Error updating user role:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not update user role.";
      toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDisable = async (userToUpdate: UserProfile) => {
    if (!db) return;
    setIsSaving(true); // Use isSaving to indicate any update operation
    try {
      const userDocRef = doc(db, 'users', userToUpdate.uid);
      const newDisabledState = !userToUpdate.isDisabled;
      await updateDoc(userDocRef, {
        isDisabled: newDisabledState,
        updatedAt: serverTimestamp()
      });
      setUsers(prev => prev.map(u => u.uid === userToUpdate.uid ? { ...u, isDisabled: newDisabledState, updatedAt: new Date() } : u));
      toast({ title: `User Account ${newDisabledState ? 'Disabled' : 'Enabled'}`, description: `${userToUpdate.displayName || userToUpdate.email}'s account status updated.` });
    } catch (err) {
      console.error("Error toggling user disable status:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not update user status.";
      toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && users.length === 0 && !error) {
    return <UsersTableSkeleton />;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Manage Users</h1>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter & Search Users</CardTitle>
            <CardDescription>Search by user email or display name.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <Input
                type="search"
                placeholder="Search by Email or Name..."
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
            <CardTitle>User List</CardTitle>
            <CardDescription>View and manage registered users.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && users.length === 0 ? (
              <UsersTableSkeleton />
            ) : !loading && users.length === 0 && !error ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm ? `No users found matching "${debouncedSearchTerm}".` : "No users found."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Cashback Balance</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-center">Status (Enabled)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((userItem) => (
                      <TableRow key={userItem.uid} className={userItem.isDisabled ? 'opacity-50 bg-muted/30' : ''}>
                        <TableCell className="font-medium">{userItem.displayName || 'N/A'}</TableCell>
                        <TableCell>{userItem.email}</TableCell>
                        <TableCell>
                          <Badge variant={userItem.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize">
                            {userItem.role === 'admin' ? <ShieldCheck className="mr-1 h-3 w-3"/> : <UserIcon className="mr-1 h-3 w-3"/>}
                            {userItem.role}
                          </Badge>
                        </TableCell>
                        <TableCell>₹{userItem.cashbackBalance.toFixed(2)}</TableCell>
                        <TableCell>{userItem.createdAt ? format(new Date(userItem.createdAt), 'PP') : 'N/A'}</TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={!userItem.isDisabled}
                            onCheckedChange={() => handleToggleDisable(userItem)}
                            disabled={isSaving}
                            aria-label={userItem.isDisabled ? 'Enable user account' : 'Disable user account'}
                          />
                          {isSaving && editingUser?.uid === userItem.uid && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(userItem)} disabled={isSaving}>
                            <Edit2 className="mr-1 h-4 w-4" /> Edit Role
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !loading && users.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Users
                </Button>
              </div>
            )}
            {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
          </CardContent>
        </Card>

        <Dialog open={!!editingUser} onOpenChange={(isOpen) => !isOpen && setEditingUser(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User Role</DialogTitle>
              <DialogDescription>
                Change the role for {editingUser?.displayName || editingUser?.email}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Select value={newRole} onValueChange={(value) => setNewRole(value as 'user' | 'admin')} disabled={isSaving}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
              </DialogClose>
              <Button type="button" onClick={handleSaveRole} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}
