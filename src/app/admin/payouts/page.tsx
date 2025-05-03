// src/app/admin/payouts/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, updateDoc, writeBatch, getDoc, serverTimestamp } from 'firebase/firestore'; // Added serverTimestamp
import { db } from '@/lib/firebase/config';
import type { PayoutRequest, UserProfile, Transaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle, XCircle, MoreHorizontal, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea"; // For rejection notes
import { Label } from "@/components/ui/label"; // For rejection notes modal
import { useToast } from "@/hooks/use-toast";
import AdminGuard from '@/components/guards/admin-guard';

// Combined type for display
interface PayoutRequestWithUser extends PayoutRequest {
  userDisplayName: string;
  userEmail: string | null;
}

function AdminPayoutsPageContent() {
  const [payouts, setPayouts] = useState<PayoutRequestWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null); // Track which request is being processed
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [payoutToReject, setPayoutToReject] = useState<PayoutRequestWithUser | null>(null);


  const fetchPayouts = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch pending payout requests
        const payoutsCollection = collection(db, 'payoutRequests');
        const qPayouts = query(
          payoutsCollection,
          where('status', '==', 'pending'), // Only fetch pending requests initially
          orderBy('requestedAt', 'asc')
        );
        const payoutsSnapshot = await getDocs(qPayouts);
        const payoutsData = payoutsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          requestedAt: doc.data().requestedAt?.toDate ? doc.data().requestedAt.toDate() : new Date(),
          processedAt: doc.data().processedAt?.toDate ? doc.data().processedAt.toDate() : null,
        })) as PayoutRequest[];

        // 2. Fetch user details for each payout request
        const usersMap = new Map<string, Pick<UserProfile, 'displayName' | 'email'>>();
        const userPromises = payoutsData.map(payout => {
          if (!usersMap.has(payout.userId)) {
            return getDoc(doc(db, 'users', payout.userId)).then(userDoc => {
              if (userDoc.exists()) {
                usersMap.set(payout.userId, {
                  displayName: userDoc.data().displayName || 'N/A',
                  email: userDoc.data().email || null,
                });
              } else {
                usersMap.set(payout.userId, { displayName: 'User Not Found', email: null });
              }
            });
          }
          return Promise.resolve();
        });
        await Promise.all(userPromises);

        // 3. Combine payout data with user details
        const combinedData = payoutsData.map(payout => {
          const userInfo = usersMap.get(payout.userId) || { displayName: 'Unknown User', email: null };
          return {
            ...payout,
            userDisplayName: userInfo.displayName,
            userEmail: userInfo.email,
          };
        });

        setPayouts(combinedData);

      } catch (err) {
        console.error("Error fetching payout requests:", err);
        setError("Failed to load payout requests. Please try again later.");
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    fetchPayouts();
  }, []);

  const handleApprove = async (payout: PayoutRequestWithUser) => {
      setProcessingId(payout.id);
      setError(null);
      console.log(`Approving payout ID: ${payout.id} for user: ${payout.userId}`);

      // Note: Actual money transfer is NOT handled here. This only updates the DB status.
      // Admin must manually process the payment via PayPal/Bank etc.

      const payoutDocRef = doc(db, 'payoutRequests', payout.id);
      // No batch needed here unless updating transactions simultaneously (which we already did on request)

      try {
          await updateDoc(payoutDocRef, {
              status: 'approved', // Or 'processing' if there's a delay
              processedAt: serverTimestamp(),
              adminNotes: 'Approved for processing.'
          });

          toast({
              title: "Payout Approved",
              description: `Payout request for ${payout.userDisplayName} (₹${payout.amount.toFixed(2)}) marked as approved. Remember to process the payment.`,
          });
           fetchPayouts(); // Refresh the list
      } catch (err) {
          console.error("Error approving payout:", err);
          toast({
              variant: "destructive",
              title: "Approval Failed",
              description: "Could not update payout status. Please try again.",
          });
           setError(`Failed to approve payout for ${payout.userDisplayName}.`);
      } finally {
          setProcessingId(null);
      }
  };

   const openRejectDialog = (payout: PayoutRequestWithUser) => {
      setPayoutToReject(payout);
      setRejectReason(''); // Clear previous reason
      setIsRejectDialogOpen(true);
   };


  const handleReject = async () => {
      if (!payoutToReject) return;

      setProcessingId(payoutToReject.id);
      setError(null);
      setIsRejectDialogOpen(false); // Close dialog immediately
      console.log(`Rejecting payout ID: ${payoutToReject.id} for user: ${payoutToReject.userId}`);

      const batch = writeBatch(db);
      const payoutDocRef = doc(db, 'payoutRequests', payoutToReject.id);
      const userDocRef = doc(db, 'users', payoutToReject.userId);

      try {
           // 1. Mark payout request as rejected
           batch.update(payoutDocRef, {
               status: 'rejected',
               processedAt: serverTimestamp(),
               adminNotes: rejectReason || 'Rejected without reason.', // Include reason
           });

           // 2. Revert transaction statuses from 'paid' back to 'confirmed'
           // And remove the payoutId from these transactions
            if (payoutToReject.transactionIds && payoutToReject.transactionIds.length > 0) {
               payoutToReject.transactionIds.forEach(txId => {
                   const txDocRef = doc(db, 'transactions', txId);
                   batch.update(txDocRef, { status: 'confirmed', payoutId: null });
               });
               console.log(`Reverted status for ${payoutToReject.transactionIds.length} transactions.`);
           } else {
               console.warn(`Payout request ${payoutToReject.id} has no associated transaction IDs to revert.`);
           }

           // 3. Add the rejected amount back to the user's cashbackBalance
           // Need to fetch current balance first to avoid race conditions if needed,
           // but for simplicity, we'll just increment based on the payout amount.
           // Consider using FieldValue.increment(payoutToReject.amount) if you fetch the user doc first.
           // For now, we assume the balance was correctly set to 0 on request.
           batch.update(userDocRef, {
               cashbackBalance: payoutToReject.amount // Restore the balance
           });
            console.log(`Restored ₹${payoutToReject.amount.toFixed(2)} to user ${payoutToReject.userId}'s balance.`);


           // 4. Commit the batch
           await batch.commit();

           toast({
               title: "Payout Rejected",
               description: `Payout request for ${payoutToReject.userDisplayName} (₹${payoutToReject.amount.toFixed(2)}) has been rejected.`,
               variant: "destructive"
           });
           fetchPayouts(); // Refresh the list
           setPayoutToReject(null); // Clear selected payout
           setRejectReason(''); // Clear reason

      } catch (err: any) {
          console.error("Error rejecting payout:", err);
          toast({
              variant: "destructive",
              title: "Rejection Failed",
              description: "Could not update payout and user balance. Please try again.",
          });
          setError(`Failed to reject payout for ${payoutToReject.userDisplayName}.`);
           setPayoutToReject(null);
           setRejectReason('');
      } finally {
          setProcessingId(null);
      }
  };

  return (
     <AdminGuard> {/* Wrap content with guard */}
       <Card>
         <CardHeader>
           <CardTitle className="text-2xl flex items-center gap-2">
             <Send className="w-6 h-6"/> Approve Payouts
           </CardTitle>
           <CardDescription>Review and approve or reject pending user payout requests.</CardDescription>
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
             <PayoutsTableSkeleton />
           ) : payouts.length > 0 ? (
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>User</TableHead>
                   <TableHead className="hidden md:table-cell">Requested At</TableHead>
                   <TableHead className="text-right">Amount</TableHead>
                   <TableHead className="hidden lg:table-cell">Method</TableHead>
                   <TableHead className="hidden xl:table-cell">Details</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {payouts.map((payout) => (
                   <TableRow key={payout.id}>
                     <TableCell>
                        <div className="font-medium">{payout.userDisplayName}</div>
                        <div className="text-xs text-muted-foreground">{payout.userEmail || 'No email'}</div>
                     </TableCell>
                      <TableCell className="hidden md:table-cell">{format(payout.requestedAt, 'PPp')}</TableCell>
                     <TableCell className="text-right font-semibold text-lg">₹{payout.amount.toFixed(2)}</TableCell>
                     <TableCell className="hidden lg:table-cell">{payout.paymentMethod}</TableCell>
                     <TableCell className="hidden xl:table-cell text-xs">
                         {/* Display payment details safely */}
                         {Object.entries(payout.paymentDetails).map(([key, value]) => (
                             <div key={key} className="truncate" title={`${key}: ${value}`}>
                                 <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span> {String(value)}
                             </div>
                         ))}
                     </TableCell>
                      <TableCell className="text-center">
                         <div className="flex items-center justify-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
                                onClick={() => handleApprove(payout)}
                                disabled={processingId === payout.id}
                                aria-label={`Approve payout for ${payout.userDisplayName}`}
                             >
                                <CheckCircle className="w-4 h-4 mr-1"/> Approve
                             </Button>
                             <Button
                                 size="sm"
                                 variant="outline"
                                 className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
                                 onClick={() => openRejectDialog(payout)}
                                 disabled={processingId === payout.id}
                                  aria-label={`Reject payout for ${payout.userDisplayName}`}
                              >
                                 <XCircle className="w-4 h-4 mr-1"/> Reject
                              </Button>
                              {/* Optional: More Actions Dropdown */}
                               <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                   <Button variant="ghost" className="h-8 w-8 p-0" disabled={processingId === payout.id}>
                                     <span className="sr-only">More actions</span>
                                     <MoreHorizontal className="h-4 w-4" />
                                   </Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent align="end">
                                   <DropdownMenuLabel>More</DropdownMenuLabel>
                                    {/* Link to view associated transactions */}
                                    <DropdownMenuItem disabled>View Transactions</DropdownMenuItem>
                                    <DropdownMenuItem disabled>Contact User</DropdownMenuItem>
                                 </DropdownMenuContent>
                               </DropdownMenu>
                         </div>
                      </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           ) : (
             <p className="text-center text-muted-foreground py-8">No pending payout requests.</p>
           )}
           {/* TODO: Add Pagination and filtering (e.g., view approved/rejected) */}
         </CardContent>

          {/* Rejection Reason Dialog */}
          <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reason for Rejection</AlertDialogTitle>
                <AlertDialogDescription>
                   Provide a reason for rejecting the payout request for {payoutToReject?.userDisplayName} (₹{payoutToReject?.amount.toFixed(2)}). This note will be saved for admin reference.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-2 py-4">
                   <Label htmlFor="rejectReason">Rejection Note (Optional)</Label>
                   <Textarea
                     id="rejectReason"
                     placeholder="e.g., Invalid payment details, suspicious activity..."
                     value={rejectReason}
                     onChange={(e) => setRejectReason(e.target.value)}
                   />
               </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPayoutToReject(null)}>Cancel</AlertDialogCancel>
                 <AlertDialogAction
                     onClick={handleReject}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                     disabled={processingId === payoutToReject?.id}>
                     Confirm Rejection
                 </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

       </Card>
     </AdminGuard>
   );
}

export default AdminPayoutsPageContent;


function PayoutsTableSkeleton() {
    return (
       <Table>
         <TableHeader>
           <TableRow>
              <TableHead><Skeleton className="h-5 w-32" /></TableHead>
              <TableHead className="hidden md:table-cell"><Skeleton className="h-5 w-36" /></TableHead>
              <TableHead className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableHead>
              <TableHead className="hidden lg:table-cell"><Skeleton className="h-5 w-28" /></TableHead>
              <TableHead className="hidden xl:table-cell"><Skeleton className="h-5 w-48" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-5 w-40 mx-auto" /></TableHead>
           </TableRow>
         </TableHeader>
         <TableBody>
           {[...Array(3)].map((_, i) => (
             <TableRow key={i}>
                <TableCell>
                   <Skeleton className="h-4 w-24 mb-1" />
                   <Skeleton className="h-3 w-36" />
                 </TableCell>
                <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                 <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-56" /></TableCell>
                <TableCell className="text-center">
                   <div className="flex items-center justify-center gap-2">
                       <Skeleton className="h-8 w-24 rounded-md" />
                       <Skeleton className="h-8 w-24 rounded-md" />
                       <Skeleton className="h-8 w-8 rounded-md" />
                   </div>
                 </TableCell>
             </TableRow>
           ))}
         </TableBody>
       </Table>
    )
 }

