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
  QueryDocumentSnapshot // Import QueryDocumentSnapshot
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
  const { user, userProfile, loading: authLoading, fetchUserProfile } = useAuth();
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
      if (user) {
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
      } else if (!authLoading) {
         // If auth is done loading and no user, redirect or show message
         router.push('/login');
         setLoading(false); // Not logged in or profile not loaded yet
      }
    };

    checkPayoutStatus();
  }, [user, authLoading, fetchUserProfile, payoutForm, router]); // Include router in dependencies

  const onSubmit = async (data: PayoutFormValues) => {
     // Use the latest profile fetched in useEffect
     if (!user || !latestUserProfile || !canRequest) return;

      // Extra safety checks before starting the transaction
      if (!db) {
         setError("Database is not initialized. Please try again later.");
         toast({ variant: "destructive", title: 'Database Error', description: "Cannot connect to the database." });
         setSubmitting(false);
         return;
      }

     setSubmitting(true);
     setError(null);

     let payoutAmount = latestUserProfile.cashbackBalance; // Payout the entire available balance based on latest fetched profile
     const payoutDetails: PayoutDetails = {
       method: data.payoutMethod as PayoutMethod,
       detail: data.payoutDetail,
     };

     try {
        console.log("Starting payout transaction for user:", user.uid); // Log user ID
        const userDocRef = doc(db, 'users', user.uid);
        console.log("User document reference path:", userDocRef.path); // Log the path being used

       // --- Transaction to ensure atomicity ---
       await runTransaction(db, async (transaction) => {
          console.log("Inside transaction, attempting to get user document...");
         const userDocSnap = await transaction.get(userDocRef);
          console.log("User document snapshot fetched inside transaction.");


         if (!userDocSnap.exists()) {
           throw new Error("User profile not found.");
         }
         const currentUserData = userDocSnap.data() as UserProfile;
          const currentBalance = currentUserData.cashbackBalance || 0;
          payoutAmount = currentBalance; // <<< CRITICAL: Use the balance read *inside* the transaction

          // Double-check balance server-side
         if (currentBalance < MIN_PAYOUT_AMOUNT) {
              throw new Error(`Your available balance (${formatCurrency(currentBalance)}) is below the minimum payout amount of ${formatCurrency(MIN_PAYOUT_AMOUNT)}.`);
         }

          // --- Verify confirmed transactions sum (important consistency check) ---
          console.log(`Querying 'confirmed' transactions with payoutId == null for user ${user.uid}...`);
          const transactionsCollection = collection(db, 'transactions');
          // Refined query: Explicitly check for payoutId == null
          const confirmedUnpaidQuery = query(
             transactionsCollection,
             where('userId', '==', user.uid),
             where('status', '==', 'confirmed'),
              // IMPORTANT: Filter out transactions already linked to a payout
             where('payoutId', '==', null),
             limit(500) // Limit query for safety
          );

           // IMPORTANT: Use transaction.get for read operations inside a transaction
          const confirmedTransactionsSnap = await transaction.get(confirmedUnpaidQuery);
          console.log(`Found ${confirmedTransactionsSnap.size} 'confirmed' and unpaid transactions.`);


         let sumOfTransactions = 0;
          const transactionIdsToUpdate: string[] = [];
          let errorMessage = "";
          confirmedTransactionsSnap.forEach(docSnap => {
            const txData = docSnap.data() as Transaction;
            // Ensure cashbackAmount is a valid number before adding
            if (typeof txData.cashbackAmount === 'number' && !isNaN(txData.cashbackAmount)) {
                transactionIdsToUpdate.push(docSnap.id);
                sumOfTransactions += txData.cashbackAmount;
                console.log(`  - Including Tx ID: ${docSnap.id}, Amount: ₹${txData.cashbackAmount.toFixed(2)}`);
            } else {
                errorMessage = "transaction with null cashbackAmount";
                console.warn(`Transaction ${docSnap.id} has missing or invalid cashbackAmount. Skipping.`);
            }
          });
          sumOfTransactions = parseFloat(sumOfTransactions.toFixed(2)); // Address potential float issues
          console.log(`Calculated sum of confirmed/unpaid transactions: ₹${sumOfTransactions.toFixed(2)}`);


         // Strict validation: Ensure the sum exactly matches the available balance
         // Allow for minor floating point discrepancies
         if (Math.abs(sumOfTransactions - payoutAmount) > 0.01) {
              // Simplified error logging - the specific message is more useful here
              console.error(`Mismatch: Sum of confirmed transactions (₹${sumOfTransactions.toFixed(2)}) does not match available balance (₹${payoutAmount.toFixed(2)}).`);
              throw new Error("Balance calculation error. There's a mismatch between your confirmed cashback and transaction history. Please contact support.");
         }


         // 1. Create Payout Request Document
         const payoutRequestRef = doc(collection(db, 'payoutRequests'));
          console.log("Attempting to set payout request document...");
         transaction.set(payoutRequestRef, {
           userId: user.uid,
           amount: payoutAmount,
           status: 'pending', // Initial status
           requestedAt: serverTimestamp(),
           processedAt: null,
           paymentMethod: payoutDetails.method,
           paymentDetails: payoutDetails,
           transactionIds: transactionIdsToUpdate, // Link transactions to this payout
           adminNotes: null,
           failureReason: null,
         });

         // 2. Update User Profile
          console.log("Attempting to update user profile document...");
         transaction.update(userDocRef, {
            cashbackBalance: 0, // Reset available balance
            // pendingCashback: currentUserData.pendingCashback || 0, // Keep pending as is - NO, pending is not related
            lastPayoutRequestAt: serverTimestamp(),
            payoutDetails: payoutDetails, // Save/update payout details used
            updatedAt: serverTimestamp(),
         });

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
        setLatestUserProfile(prev => prev ? { ...prev, cashbackBalance: 0, lastPayoutRequestAt: new Date(), payoutDetails: payoutDetails } : null);

     } catch (err: any) {
       console.error("Payout request failed inside transaction:", err);
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
              : `You have recently requested a payout or have a pending request. Please wait for it to be processed.` // More specific message
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
