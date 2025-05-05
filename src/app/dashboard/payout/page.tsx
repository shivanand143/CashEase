// src/app/dashboard/payout/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp,
  runTransaction,
  limit,
  Timestamp, // Import Timestamp
  DocumentData, // Import DocumentData
  QueryDocumentSnapshot, // Import QueryDocumentSnapshot
  Query, // Import Query type
  DocumentReference, // Import DocumentReference
  getDoc // Import getDoc for single document fetch
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { PayoutDetails, PayoutMethod, UserProfile, Transaction } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, IndianRupee, Loader2, Send, Building, Banknote, Gift } from 'lucide-react';
import { formatCurrency, safeToDate } from '@/lib/utils';
import ProtectedRoute from '@/components/guards/protected-route';

const MIN_PAYOUT_AMOUNT = 250; // Minimum withdrawal amount

// --- Payout Form Schema ---
const payoutSchema = z.object({
  payoutMethod: z.enum(['bank_transfer', 'paypal', 'gift_card']),
  payoutDetail: z.string().min(3, 'Payout detail is required').max(100, 'Detail too long'),
});
type PayoutFormValues = z.infer<typeof payoutSchema>;

function PayoutPageContent() {
  const { user, userProfile, loading: authLoading, fetchUserProfile } = useAuth(); // Ensure fetchUserProfile is available
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [lastRequestDate, setLastRequestDate] = useState<Date | null>(null);
  const [canRequest, setCanRequest] = useState(false);
  const [latestUserProfile, setLatestUserProfile] = useState<UserProfile | null>(userProfile); // State to hold latest profile

  // Form Hook
  const payoutForm = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutSchema),
    defaultValues: {
      payoutMethod: userProfile?.payoutDetails?.method || 'bank_transfer',
      payoutDetail: userProfile?.payoutDetails?.detail || '',
    },
  });

  // Fetch current balance and check eligibility on mount/user change
  useEffect(() => {
    const checkPayoutStatus = async () => {
      // Ensure user and fetchUserProfile are available before proceeding
      if (user && fetchUserProfile) {
        setLoading(true);
        setError(null);
        try {
           // Re-fetch the latest profile to ensure balance is up-to-date
           const profile = await fetchUserProfile(user.uid);
           setLatestUserProfile(profile); // Store the latest profile

           if (!profile) {
              throw new Error("Could not load your profile data.");
           }
           const balance = profile.cashbackBalance || 0;
           setAvailableBalance(balance);
           setLastRequestDate(safeToDate(profile.lastPayoutRequestAt)); // Convert potentially null timestamp

           // Check eligibility rules
           const isEligible = balance >= MIN_PAYOUT_AMOUNT;
           setCanRequest(isEligible);

           // Pre-fill form with saved details if available
           if (profile.payoutDetails) {
             payoutForm.reset({
               payoutMethod: profile.payoutDetails.method,
               payoutDetail: profile.payoutDetails.detail,
             });
           }

        } catch (err: any) {
          console.error("Error checking payout status:", err);
          setError(err.message || "Failed to load payout information.");
        } finally {
          setLoading(false);
        }
      } else if (!authLoading && !user) {
         // If auth is done loading and no user, redirect or show message
         console.log("User not logged in, redirecting to login.");
         router.push('/login');
         setLoading(false); // Not logged in or profile not loaded yet
      } else if (!fetchUserProfile) {
         console.error("fetchUserProfile function is missing from useAuth context.");
         setError("Internal application error. Please contact support.");
         setLoading(false);
      }
    };

    checkPayoutStatus();
  }, [user, authLoading, fetchUserProfile, payoutForm, router]); // Include router in dependencies


  const onSubmit = async (data: PayoutFormValues) => {
     // Use the latest profile fetched in useEffect
     if (!user || !latestUserProfile || !canRequest) {
         console.warn("Payout submission skipped: User, profile, or eligibility missing.");
         return;
     }
     setSubmitting(true);
     setError(null);

     let payoutAmount = latestUserProfile.cashbackBalance; // Initial payout amount
     const payoutDetails: PayoutDetails = {
       method: data.payoutMethod as PayoutMethod,
       detail: data.payoutDetail,
     };


     try {
        console.log("Starting payout transaction for user:", user.uid);
        const userDocRef = doc(db, 'users', user.uid);
        console.log("User document reference path:", userDocRef.path);
        const transactionsCollectionRef = collection(db, 'transactions'); // Reference to the collection

       // --- Transaction to ensure atomicity ---
       await runTransaction(db, async (transaction) => {
          console.log("Inside transaction, attempting to get user document...");
          const userDocSnap = await transaction.get(userDocRef);
          console.log("User document snapshot fetched inside transaction.");

          if (!userDocSnap.exists()) {
            throw new Error("User profile not found.");
          }
          const currentUserData = userDocSnap.data() as UserProfile;
          payoutAmount = currentUserData.cashbackBalance || 0; // <<< CRITICAL: Use the balance read *inside* the transaction

          console.log(`Transaction check: User balance is ₹${payoutAmount.toFixed(2)}`);

          // Double-check balance server-side
          if (payoutAmount < MIN_PAYOUT_AMOUNT) {
               throw new Error(`Your available balance (${formatCurrency(payoutAmount)}) is below the minimum payout amount of ${formatCurrency(MIN_PAYOUT_AMOUNT)}.`);
          }

           // --- Verify confirmed transactions sum INSIDE transaction ---
           const confirmedUnpaidQuery = query(
               transactionsCollectionRef, // Use the collection reference
               where('userId', '==', user.uid),
               where('status', '==', 'confirmed'),
               where('payoutId', '==', null) // Explicitly check for null payoutId
           );

            console.log(`Querying 'confirmed' transactions with payoutId == null for user ${user.uid}...`);

            // IMPORTANT: Use transaction.get() for reads inside a transaction for consistency
            let confirmedTransactionsSnap; // Declare outside try/catch
            try {
               // Execute the query *within* the transaction's scope if possible
               // Note: Firestore transactions have limitations on queries.
               // If this query fails inside the transaction, you might need to perform
               // the verification *before* the transaction starts, accepting a small
               // risk of race conditions, or redesign the data model.
               // For now, we attempt the query inside.
               const querySnapshot = await getDocs(confirmedUnpaidQuery); // Fetch directly, not via transaction.get(query)
               confirmedTransactionsSnap = querySnapshot; // Assign the snapshot
            } catch (getQueryError: any) {
                console.error("Error querying transactions within transaction scope:", getQueryError);
                // Rethrow a more specific error
                throw new Error(`Failed to verify transactions during payout: ${getQueryError.message}`);
            }

           console.log(`Found ${confirmedTransactionsSnap.size} 'confirmed' and unpaid transactions.`);

           const transactionIdsToUpdate: string[] = [];
           let sumOfTransactions = 0;
           let errorMessage = "";

           // Iterate over the snapshot obtained *before* or *during* the transaction
           confirmedTransactionsSnap.forEach(docSnap => {
                const txData = docSnap.data() as Transaction;
                // Re-validate status and payoutId (double-check)
                if (txData.status === 'confirmed' && txData.payoutId === null) {
                    if (typeof txData.cashbackAmount === 'number' && !isNaN(txData.cashbackAmount)) {
                        transactionIdsToUpdate.push(docSnap.id);
                        sumOfTransactions += txData.cashbackAmount;
                        console.log(`  - Verified Tx ID: ${docSnap.id}, Amount: ₹${txData.cashbackAmount.toFixed(2)}`);
                    } else {
                        errorMessage = "Transaction with invalid cashbackAmount found during verification.";
                        console.error(`Transaction ${docSnap.id} has invalid cashbackAmount during transaction verification.`);
                        // Decide if this should abort the transaction - YES, it should.
                        throw new Error(errorMessage);
                    }
                } else {
                     console.warn(`Transaction ${docSnap.id} status (${txData.status}) or payoutId (${txData.payoutId}) is not as expected. Skipping.`);
                }
            });

           sumOfTransactions = parseFloat(sumOfTransactions.toFixed(2));
           console.log(`Transaction verification: Calculated sum is ₹${sumOfTransactions.toFixed(2)}`);

           // Strict validation against the balance read *inside* the transaction
           if (Math.abs(sumOfTransactions - payoutAmount) > 0.01) {
               console.error(`Mismatch inside transaction: Sum (₹${sumOfTransactions.toFixed(2)}) vs Balance (₹${payoutAmount.toFixed(2)})`);
               throw new Error("Balance calculation error. There's a mismatch between your confirmed cashback and transaction history. Please contact support.");
           }

           // 1. Create Payout Request Document
           const payoutRequestRef = doc(collection(db, 'payoutRequests'));
           console.log("Attempting to set payout request document...");
           transaction.set(payoutRequestRef, {
             userId: user.uid,
             amount: payoutAmount, // Use the balance read inside the transaction
             status: 'pending', // Initial status
             requestedAt: serverTimestamp(),
             processedAt: null,
             paymentMethod: payoutDetails.method,
             paymentDetails: payoutDetails,
             transactionIds: transactionIdsToUpdate, // Link transactions to this payout
             adminNotes: null,
             failureReason: null,
           });
           console.log("Payout request document prepared.");


           // 2. Update User Profile
           console.log("Attempting to update user profile document...");
           transaction.update(userDocRef, {
              cashbackBalance: 0, // Reset available balance
              lastPayoutRequestAt: serverTimestamp(),
              payoutDetails: payoutDetails, // Save/update payout details used
              updatedAt: serverTimestamp(),
           });
           console.log("User profile update prepared.");


           // 3. Update included Transactions (set payoutId)
           console.log(`Attempting to update ${transactionIdsToUpdate.length} transactions with payoutId: ${payoutRequestRef.id}`);
           transactionIdsToUpdate.forEach(txId => {
             const txRef = doc(db, 'transactions', txId);
             transaction.update(txRef, { payoutId: payoutRequestRef.id, updatedAt: serverTimestamp() });
           });
           console.log("Transaction updates prepared.");
       });
       // --- Transaction End ---
       console.log("Transaction committed successfully.");


       toast({
         title: 'Payout Request Submitted',
         description: `Your request for ${formatCurrency(payoutAmount)} has been received and is pending approval.`,
       });

       // Reset form and local state after successful submission
       setAvailableBalance(0); // Reflect the balance change locally
       setCanRequest(false); // User can't request again immediately
       setLastRequestDate(new Date()); // Update last request date locally
       // Update local profile state as well
       setLatestUserProfile(prev => prev ? { ...prev, cashbackBalance: 0, lastPayoutRequestAt: new Date(), payoutDetails: payoutDetails } : null);


     } catch (err: any) {
       console.error("Payout request failed:", err); // Log the full error
       setError(err.message || "Failed to submit payout request.");
       toast({ variant: "destructive", title: 'Payout Failed', description: err.message || "Could not submit request." });
     } finally {
       setSubmitting(false);
       console.log("Payout submission process finished.");
     }
  };

  if (authLoading || loading) {
    return <PayoutSkeleton />;
  }

  if (!user) {
     // Shouldn't happen if ProtectedRoute is used, but handle defensively
     return (
       <Alert variant="destructive">
         <AlertCircle className="h-4 w-4" />
         <AlertTitle>Not Authenticated</AlertTitle>
         <AlertDescription>Please log in to request a payout.</AlertDescription>
       </Alert>
     );
   }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">Request Payout</h1>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Available Balance</CardTitle>
          <CardDescription>
             This is the confirmed cashback ready for withdrawal. Minimum payout is {formatCurrency(MIN_PAYOUT_AMOUNT)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-primary">{formatCurrency(availableBalance)}</p>
        </CardContent>
      </Card>

      {!canRequest && !loading && (
        <Alert variant={availableBalance < MIN_PAYOUT_AMOUNT ? "default" : "info"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Payout Not Available</AlertTitle>
          <AlertDescription>
            {availableBalance < MIN_PAYOUT_AMOUNT
              ? `You need at least ${formatCurrency(MIN_PAYOUT_AMOUNT)} confirmed cashback to request a payout.`
              : `You may have recently requested a payout or have a pending request. Please wait for it to be processed.` // More specific message
            }
             <Button variant="link" className="p-0 h-auto ml-2" onClick={() => router.push('/stores')}>
                 Keep Shopping!
             </Button>
          </AlertDescription>
        </Alert>
      )}

      {canRequest && (
        <Card>
          <CardHeader>
            <CardTitle>Payout Details</CardTitle>
            <CardDescription>Choose your preferred method and provide the necessary details.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={payoutForm.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="payoutMethod">Payout Method</Label>
                <Select
                  value={payoutForm.watch('payoutMethod')}
                  onValueChange={(value) => payoutForm.setValue('payoutMethod', value as PayoutMethod)}
                  disabled={submitting}
                >
                  <SelectTrigger id="payoutMethod">
                    <SelectValue placeholder="Select a payout method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">
                       <div className="flex items-center gap-2">
                          <Building className="h-4 w-4"/> Bank Transfer (UPI/NEFT)
                       </div>
                    </SelectItem>
                    <SelectItem value="paypal">
                       <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4"/> PayPal
                       </div>
                    </SelectItem>
                    <SelectItem value="gift_card">
                       <div className="flex items-center gap-2">
                           <Gift className="h-4 w-4"/> Amazon/Flipkart Gift Card
                       </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {payoutForm.formState.errors.payoutMethod && (
                  <p className="text-sm text-destructive">{payoutForm.formState.errors.payoutMethod.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="payoutDetail">Details</Label>
                <Input
                  id="payoutDetail"
                  placeholder={
                    payoutForm.watch('payoutMethod') === 'paypal' ? 'Your PayPal Email Address' :
                    payoutForm.watch('payoutMethod') === 'bank_transfer' ? 'Your UPI ID or Bank Account (Name, Acc No, IFSC)' :
                    'Email for Gift Card Delivery'
                  }
                  {...payoutForm.register('payoutDetail')}
                  disabled={submitting}
                />
                {payoutForm.formState.errors.payoutDetail && (
                  <p className="text-sm text-destructive">{payoutForm.formState.errors.payoutDetail.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Please double-check details. Incorrect information may delay your payout.
                </p>
              </div>

              <Button type="submit" disabled={submitting || !canRequest} className="w-full">
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" /> Request Payout of {formatCurrency(availableBalance)}</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Skeleton Loader
function PayoutSkeleton() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
       <Skeleton className="h-9 w-1/3" />

       <Card>
           <CardHeader>
               <Skeleton className="h-6 w-1/2 mb-2" />
               <Skeleton className="h-4 w-3/4" />
           </CardHeader>
           <CardContent>
               <Skeleton className="h-12 w-1/2" />
           </CardContent>
       </Card>

       <Card>
           <CardHeader>
               <Skeleton className="h-6 w-1/2 mb-2" />
               <Skeleton className="h-4 w-3/4" />
           </CardHeader>
           <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <Skeleton className="h-10 w-full" />
           </CardContent>
       </Card>
    </div>
  );
}


export default function PayoutPage() {
  return (
    <ProtectedRoute>
      <PayoutPageContent />
    </ProtectedRoute>
  );
}
