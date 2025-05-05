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
  getDoc, // Import getDoc for single document fetch
  orderBy
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

     // Clear previous errors
     setError(null);


     try {
        console.log("Starting payout transaction for user:", user.uid);
        const userDocRef = doc(db, 'users', user.uid);
        console.log("User document reference path:", userDocRef.path);
        const transactionsCollectionRef = collection(db, 'transactions'); // Reference to the collection

       // --- Transaction to ensure atomicity ---
       let batchCommitResult = null; // Variable to store the result of the transaction
               if (db) {
                 // Define the transaction function
                 const transactionFn = async (transaction: any) => { // Use 'any' for transaction type or import firebase.firestore.Transaction if using Admin SDK
                     console.log("Inside transaction, attempting to get user document...");
                     const userDocSnap = await transaction.get(userDocRef);
                     console.log("User document snapshot fetched inside transaction.");

                     if (!userDocSnap.exists()) {
                         throw new Error("User profile not found.");
                     }
                     const currentUserData = userDocSnap.data() as UserProfile;
                     const userBalance = currentUserData.cashbackBalance || 0; // Default to 0 if undefined

                        if (userBalance < MIN_PAYOUT_AMOUNT){ throw new Error(`Balance should be higher or equal to ${MIN_PAYOUT_AMOUNT}`)}
                         // Start: Check is amount is not less than the minimum and everything is fine otherwise just throw
                         if (payoutAmount < MIN_PAYOUT_AMOUNT) {
                             throw new Error(`Minimum payout amount is ${MIN_PAYOUT_AMOUNT}.`);
                         }
                         // End: Check is amount is not less than the minimum and everything is fine otherwise just throw
                         // Fetch user data
                         const userSnap = await getDoc(userDocRef); // Use getDoc instead of transaction.get for initial balance check
                         if (!userSnap.exists()) {
                             throw new Error("User not found");
                         }
                         const userData = userSnap.data() as UserProfile;
                         const userCashbackBalance = userData.cashbackBalance || 0;

                         // Fetch confirmed transactions NOT linked to a payout
                         const confirmedUnpaidQuery = query(
                             transactionsCollectionRef,
                             where("userId", "==", user.uid),
                             where("status", "==", "confirmed"),
                             where("payoutId", "==", null) // Correct check for null payoutId
                         );
                         const batchTransactionSnap = await getDocs(confirmedUnpaidQuery);
                         const allTransactionsInsideFunction = batchTransactionSnap.docs.map(doc => ({
                                transactionId: doc.id,
                                ...doc.data()
                            }) as Transaction)
                         const totalCashbackAmount = allTransactionsInsideFunction.reduce((sum, tx) => sum + (tx.cashbackAmount || 0), 0); // Default to 0 if cashbackAmount is missing

                         if (Math.abs(totalCashbackAmount - userCashbackBalance) > 0.01) {
                             console.error(`Balance mismatch: Calculated sum ${totalCashbackAmount}, User balance ${userCashbackBalance}`);
                             throw new Error("Balance calculation error. Contact support.")
                         }
                         const finalPayoutAmount = parseFloat(totalCashbackAmount.toFixed(2)); // Convert and re-assign

                         console.log(`Starting payout of ${finalPayoutAmount.toFixed(2)}`);
                         const requestData = {
                             userId: user.uid,
                             amount: finalPayoutAmount,
                             status: "pending",
                             requestedAt: serverTimestamp(),
                             paymentMethod: data.payoutMethod,
                             paymentDetails: payoutDetails,
                             transactionIds: allTransactionsInsideFunction.map(tx => tx.id), // Map to transaction IDs
                             adminNotes: null,
                             failureReason: null,
                             processedAt: null,
                         };

                         // Create payout request
                         const payoutRequestRef = doc(collection(db, 'payoutRequests'));
                         transaction.set(payoutRequestRef, requestData);
                         // Reset user's cashback balance
                         transaction.update(userDocRef, {
                             cashbackBalance: 0,
                             updatedAt: serverTimestamp(),
                         });
                          console.log(`User profile update prepared.`);


                         // Link transactions to payout request

                         console.log(`Attempting to update ${payoutRequestRef} transactions with payoutId: ${payoutRequestRef.id}`);
                         const payoutId = payoutRequestRef.id; // Capture payoutRequestRef.id outside loop
                         for (const transactionData of allTransactionsInsideFunction) {
                             const transactionRef = doc(db, "transactions", transactionData.id);
                             transaction.update(transactionRef, {
                                 payoutId: payoutId,
                                 updatedAt: serverTimestamp()
                             });
                         }
                          console.log("Transaction updates prepared.");
                 };
                 // Run the transaction
                 batchCommitResult = await runTransaction(db, transactionFn);
                }


                console.log(`Transaction committed successfully. Refreshed balance:  ${availableBalance.toFixed(2)}`);
                console.log(`Payout processing completed successfully. Refreshed balance:  ${availableBalance.toFixed(2)}`);


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

         // Refetch user to update the value and balance
        const profile = await fetchUserProfile(user.uid);
            if (profile) {
                 setLatestUserProfile(profile);
                 setAvailableBalance(profile.cashbackBalance || 0);
                 setCanRequest((profile.cashbackBalance || 0) >= MIN_PAYOUT_AMOUNT);
            }


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
             <>

             <span className="inline-flex h-8 items-center space-x-2 text-sm">
                  <h2>Your available balance to withdraw:</h2>
                 <IndianRupee className="mr-1 h-4 w-4" />
                 {availableBalance.toFixed(2)}
                 {/* Add more sections as needed */}
             </span>
             </>
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
