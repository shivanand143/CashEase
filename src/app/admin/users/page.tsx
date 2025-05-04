// src/app/admin/users/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore'; // Added doc, updateDoc, serverTimestamp
import { db } from '@/lib/firebase/config';
import type { UserProfile, User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, Users, MoreHorizontal, ShieldCheck, UserX, UserCheck } from 'lucide-react'; // Added more icons
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog
import { useToast } from "@/hooks/use-toast"; // Import useToast
import AdminGuard from '@/components/guards/admin-guard'; // Ensure page is protected
import { useAuth } from '@/hooks/use-auth'; // Import the useAuth hook


function AdminUsersPageContent() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast(); // Initialize toast
  // Get the function from the hook for updating roles centrally
  const { fetchUserProfile } = useAuth();
  const [userToConfirm, setUserToConfirm] = useState<UserProfile | null>(null); // For confirmation dialog
  const [actionToConfirm, setActionToConfirm] = useState<'make_admin' | 'disable' | 'enable' | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const usersCollection = collection(db, 'users');
      // Order by creation date, newest first
      const q = query(usersCollection, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id, // Include the document ID
        ...doc.data(),
        // Ensure date fields are converted
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(0), // Use fallback date
        updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(0), // Use fallback date
      })) as UserProfile[];
      setUsers(usersData);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load users. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);


  const handleUpdateUserRole = async (userId: string, newRole: 'admin' | 'user') => {
    console.log(`Attempting to change role for user ID: ${userId} to ${newRole}`);

    try {
        // Use Firestore directly to update the role for simplicity in admin context
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, {
          role: newRole,
          updatedAt: serverTimestamp()
        });

        toast({
            title: "Role Updated",
            description: `User role successfully changed to ${newRole}.`,
        });
        fetchUsers(); // Refresh the user list
    } catch (err) {
        console.error("Error updating user role:", err);
        toast({
            variant: "destructive",
            title: "Update Failed",
            description: `Could not update user role. Error: ${err instanceof Error ? err.message : String(err)}`,
        });
        setError(`Failed to update role for user ${userId}.`);
    } finally {
        // Reset confirmation state
        setUserToConfirm(null);
        setActionToConfirm(null);
    }
 };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
     const newStatus = !currentStatus; // Toggle the status
     const actionText = newStatus ? 'enable' : 'disable';
     console.log(`Attempting to ${actionText} user ID: ${userId}`);
     const userDocRef = doc(db, 'users', userId);
     try {
         // Check if the user profile type includes an 'isDisabled' or similar field.
         await updateDoc(userDocRef, {
             isDisabled: !newStatus, // Example: set isDisabled to true if newStatus is false (disabled)
             updatedAt: serverTimestamp(),
         });
         toast({
             title: `User ${newStatus ? 'Enabled' : 'Disabled'}`,
             description: `User has been successfully ${actionText}d.`,
         });
         fetchUsers(); // Refresh the user list
     } catch (err) {
         console.error(`Error ${actionText}ing user:`, err);
         toast({
             variant: "destructive",
             title: "Update Failed",
             description: `Could not ${actionText} user. Error: ${err instanceof Error ? err.message : String(err)}`,
         });
         setError(`Failed to ${actionText} user ${userId}.`);
     } finally {
        // Reset confirmation state
        setUserToConfirm(null);
        setActionToConfirm(null);
     }
 };


  const openConfirmationDialog = (user: UserProfile, action: 'make_admin' | 'disable' | 'enable') => {
      setUserToConfirm(user);
      setActionToConfirm(action);
  };

  const closeConfirmationDialog = () => {
      setUserToConfirm(null);
      setActionToConfirm(null);
  };

  const confirmAction = () => {
       if (!userToConfirm || !actionToConfirm) return;

       switch (actionToConfirm) {
           case 'make_admin':
                // Pass necessary user info for role update
               handleUpdateUserRole(userToConfirm.uid, 'admin');
               break;
           case 'disable':
               // Assuming 'isDisabled' field exists. Default to 'false' if not present.
               handleToggleUserStatus(userToConfirm.uid, !(userToConfirm.isDisabled ?? false));
               break;
           case 'enable':
                // Assuming 'isDisabled' field exists. Default to 'false' if not present.
                handleToggleUserStatus(userToConfirm.uid, !(userToConfirm.isDisabled ?? false));
               break;
       }
   };


  return (
    <AdminGuard> {/* Wrap content with guard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Users className="w-6 h-6"/> Manage Users
          </CardTitle>
          <CardDescription>View and manage user accounts in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading ? (
            <UsersTableSkeleton />
          ) : users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Role</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                   <TableHead className="hidden md:table-cell text-center">Status</TableHead> {/* Added Status */}
                  <TableHead className="text-right">Balance</TableHead>
                   <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isDisabled = user.isDisabled ?? false; // Default to false if undefined
                  return (
                  <TableRow key={user.uid}>
                    <TableCell className="font-medium">{user.displayName || 'N/A'}</TableCell>
                    <TableCell>{user.email}</TableCell>
                     <TableCell className="hidden md:table-cell">
                        <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize">
                           {user.role}
                        </Badge>
                     </TableCell>
                     <TableCell className="hidden lg:table-cell">{format(user.createdAt instanceof Date ? user.createdAt : (user.createdAt as any)?.toDate() ?? new Date(0), 'PP')}</TableCell>
                     <TableCell className="hidden md:table-cell text-center">
                         <Badge variant={isDisabled ? 'outline' : 'default'}>
                           {isDisabled ? 'Disabled' : 'Active'}
                         </Badge>
                     </TableCell>
                    <TableCell className="text-right">₹{user.cashbackBalance.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem disabled>View Details</DropdownMenuItem> {/* Add view details page later */}
                           <DropdownMenuItem disabled>Edit User</DropdownMenuItem> {/* Add edit user functionality later */}
                           <DropdownMenuSeparator />
                           {user.role !== 'admin' && (
                               <AlertDialogTrigger asChild>
                                 <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50" onClick={() => openConfirmationDialog(user, 'make_admin')}>
                                   <ShieldCheck className="mr-2 h-4 w-4" /> Make Admin
                                 </Button>
                               </AlertDialogTrigger>
                           )}
                           {isDisabled ? (
                             <AlertDialogTrigger asChild>
                                 <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50" onClick={() => openConfirmationDialog(user, 'enable')}>
                                  <UserCheck className="mr-2 h-4 w-4" /> Enable User
                                 </Button>
                             </AlertDialogTrigger>
                           ) : (
                              <AlertDialogTrigger asChild>
                                 <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50" onClick={() => openConfirmationDialog(user, 'disable')}>
                                   <UserX className="mr-2 h-4 w-4"/> Disable User
                                 </Button>
                              </AlertDialogTrigger>
                           )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No users found.</p>
          )}
          {/* TODO: Add Pagination if the user list becomes large */}
        </CardContent>
      </Card>

       {/* Confirmation Dialog */}
       <AlertDialog open={!!userToConfirm} onOpenChange={closeConfirmationDialog}>
          <AlertDialogContent>
             <AlertDialogHeader>
               <AlertDialogTitle>Confirm Action</AlertDialogTitle>
               <AlertDialogDescription>
                 Are you sure you want to {actionToConfirm === 'make_admin' ? 'make' : actionToConfirm === 'disable' ? 'disable' : 'enable'} user "{userToConfirm?.displayName || userToConfirm?.email}"
                 {actionToConfirm === 'make_admin' ? ' an admin' : ''}?
                 {actionToConfirm === 'disable' && ' This will prevent them from logging in.'}
                  {actionToConfirm === 'enable' && ' This will allow them to log in again.'}
               </AlertDialogDescription>
             </AlertDialogHeader>
             <AlertDialogFooter>
               <AlertDialogCancel onClick={closeConfirmationDialog}>Cancel</AlertDialogCancel>
               <AlertDialogAction
                  onClick={confirmAction}
                  className={actionToConfirm === 'make_admin' || actionToConfirm === 'disable' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
                >
                 Confirm
               </AlertDialogAction>
             </AlertDialogFooter>
          </AlertDialogContent>
       </AlertDialog>

    </AdminGuard>
  );
}

export default AdminUsersPageContent;


function UsersTableSkeleton() {
   return (
      <Table>
        <TableHeader>
          <TableRow>
             <TableHead><Skeleton className="h-4 w-24" /></TableHead>
             <TableHead><Skeleton className="h-4 w-40" /></TableHead>
             <TableHead className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableHead>
             <TableHead className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableHead>
             <TableHead className="hidden md:table-cell text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableHead>
             <TableHead className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(5)].map((_, i) => (
            <TableRow key={i}>
               <TableCell><Skeleton className="h-4 w-32" /></TableCell>
               <TableCell><Skeleton className="h-4 w-48" /></TableCell>
               <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
               <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
               <TableCell className="hidden md:table-cell text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
               <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-8 w-8 rounded-full mx-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
   )
}
