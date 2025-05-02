// src/app/admin/users/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, Users, MoreHorizontal } from 'lucide-react';
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
import AdminGuard from '@/components/guards/admin-guard'; // Ensure page is protected

function AdminUsersPageContent() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      try {
        const usersCollection = collection(db, 'users');
        // Order by creation date, newest first
        const q = query(usersCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const usersData = querySnapshot.docs.map(doc => ({
          ...doc.data(),
          // Ensure date fields are converted
           createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
           updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
        })) as UserProfile[];
        setUsers(usersData);
      } catch (err) {
        console.error("Error fetching users:", err);
        setError("Failed to load users. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleAction = (userId: string, action: 'edit' | 'view_details' | 'disable' | 'make_admin') => {
      console.log(`Action '${action}' triggered for user ID: ${userId}`);
      // TODO: Implement actual actions (e.g., navigate to edit page, show modal, update Firestore)
       alert(`Action '${action}' for user ${userId} - Implementation pending.`);
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
                  <TableHead className="text-right">Balance</TableHead>
                   <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell className="font-medium">{user.displayName || 'N/A'}</TableCell>
                    <TableCell>{user.email}</TableCell>
                     <TableCell className="hidden md:table-cell">
                        <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'} className="capitalize">
                           {user.role}
                        </Badge>
                     </TableCell>
                     <TableCell className="hidden lg:table-cell">{format(user.createdAt, 'PP')}</TableCell>
                    <TableCell className="text-right">${user.cashbackBalance.toFixed(2)}</TableCell>
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
                          <DropdownMenuItem onClick={() => handleAction(user.uid, 'view_details')}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAction(user.uid, 'edit')}>Edit User</DropdownMenuItem>
                           <DropdownMenuSeparator />
                           {user.role !== 'admin' && (
                             <DropdownMenuItem onClick={() => handleAction(user.uid, 'make_admin')}>Make Admin</DropdownMenuItem>
                           )}
                           {/* Add disable/enable logic based on user status */}
                           <DropdownMenuItem onClick={() => handleAction(user.uid, 'disable')} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                              Disable User
                           </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No users found.</p>
          )}
          {/* TODO: Add Pagination if the user list becomes large */}
        </CardContent>
      </Card>
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
               <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-8 w-8 rounded-full mx-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
   )
}
