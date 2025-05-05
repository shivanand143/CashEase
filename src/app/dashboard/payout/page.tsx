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
import ProtectedRoute from '@/components/guards/protected-route'; // Use ProtectedRoute

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
                const newBalance = parseFloat(balance.toFixed(2)); // Ensure consistent precision
                setAvailableBalance(newBalance);
                setLastRequestDate(safeToDate(profile.lastPayoutRequestAt)); // Convert potentially null timestamp

                // Check eligibility rules
                const isEligible = newBalance >= MIN_PAYOUT_AMOUNT;
                setCanRequest(isEligible);

                // Pre-fill form with saved details if available
                if (profile.payoutDetails) {
                    payoutForm.reset({
                        payoutMethod: profile.payoutDetails.method,
                        payoutDetail: profile.payoutDetails.detail,
                    });
                } else {
                    // Reset to defaults if no saved details
                     payoutForm.reset({
                        payoutMethod: 'bank_transfer',
                        payoutDetail: '',
                      });
                }

            } catch (err: any) {
                console.error("Error checking payout status:", err);
                setError(err.message || "Failed to load payout information.");
                 // Reset form on error as well
                 payoutForm.reset({ payoutMethod: 'bank_transfer', payoutDetail: '' });
                 setAvailableBalance(0);
                 setCanRequest(false);
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
     if (!user || !latestUserProfile) {
         setError("User profile is not loaded. Please try again.");
         toast({ variant: "destructive", title: 'Error', description: "User profile not available." });
         return;
     }

     // Re-check eligibility based on the *latest* profile data
     const currentBalance = latestUserProfile.cashbackBalance || 0;
     if (currentBalance < MIN_PAYOUT_AMOUNT) {
         setError(`Minimum payout amount of ${formatCurrency(MIN_PAYOUT_AMOUNT)} not met.`);
         toast({ variant: "destructive", title: 'Payout Not Allowed', description: `Minimum payout amount is ${formatCurrency(MIN_PAYOUT_AMOUNT)}.` });
         setCanRequest(false); // Update state if balance dropped below threshold
         return;
     }

     setSubmitting(true);
     setError(null);

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
                         throw new Error("User profile not found during transaction.");
                     }
                     const currentUserData = userDocSnap.data() as UserProfile;
                     // CRITICAL: Use the balance read *inside* the transaction for validation
                     const userBalanceInTransaction = currentUserData.cashbackBalance || 0;

                     console.log(`User balance read inside transaction: ₹${userBalanceInTransaction.toFixed(2)}`);

                     if (userBalanceInTransaction < MIN_PAYOUT_AMOUNT){
                         throw new Error(`Balance (₹${userBalanceInTransaction.toFixed(2)}) is below minimum payout (₹${MIN_PAYOUT_AMOUNT}).`);
                     }

                     // Query confirmed transactions NOT linked to a payout *inside* the transaction
                     console.log(`Querying 'confirmed' transactions with payoutId == null for user ${user.uid}...`);
                     const confirmedUnpaidQuery = query(
                         transactionsCollectionRef,
                         where("userId", "==", user.uid),
                         where("status", "==", "confirmed"),
                         where("payoutId", "==", null) // Check that payoutId is explicitly null
                     );

                     let confirmedTransactionsSnap; // Declare outside try/catch
                     try {
                         // IMPORTANT: Execute the query *within* the transaction context
                         // NOTE: Firestore transactions have limitations on queries.
                         // If this query doesn't work inside a transaction (might happen with complex queries),
                         // you might need to restructure:
                         // 1. Fetch IDs outside the transaction (less safe for consistency).
                         // 2. Use a Cloud Function triggered by the payout request for processing.
                         // For now, let's assume this simple query works within the transaction.
                         confirmedTransactionsSnap = await transaction.get(confirmedUnpaidQuery);
                     } catch (getQueryError: any) {
                         console.error("Error during transaction.get(query):", getQueryError);
                         // Rethrow a more specific error
                         throw new Error(`Failed to query transactions during payout: ${getQueryError.message}`);
                     }

                     console.log(`Found ${confirmedTransactionsSnap.docs.length} 'confirmed' and unpaid transactions inside transaction.`);

                     const transactionIdsToUpdate: string[] = [];
                     let sumOfTransactions = 0;
                     const fetchedTransactionsForLog: any[] = []; // For logging

                     confirmedTransactionsSnap.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
                         const txData = docSnap.data() as Transaction;
                         fetchedTransactionsForLog.push({ id: docSnap.id, ...txData }); // Log fetched data
                         if (txData.cashbackAmount !== undefined && txData.cashbackAmount !== null && !isNaN(txData.cashbackAmount)) {
                             transactionIdsToUpdate.push(docSnap.id);
                             sumOfTransactions += txData.cashbackAmount;
                             console.log(`  - Including Tx ID: ${docSnap.id}, Amount: ₹${txData.cashbackAmount.toFixed(2)}, Status: ${txData.status}, PayoutID: ${txData.payoutId}`);
                         } else {
                             console.warn(`Transaction ${docSnap.id} has missing or invalid cashbackAmount. Skipping.`);
                         }
                     });

                     sumOfTransactions = parseFloat(sumOfTransactions.toFixed(2)); // Ensure precision
                     console.log(`Calculated sum of confirmed/unpaid transactions: ₹${sumOfTransactions.toFixed(2)}`);

                     // Strict validation against the balance read *inside* the transaction
                     // Use userBalanceInTransaction here
                     if (Math.abs(sumOfTransactions - userBalanceInTransaction) > 0.01) {
                         console.error(`Mismatch inside transaction: Sum (₹${sumOfTransactions.toFixed(2)}) vs Profile Balance (₹${userBalanceInTransaction.toFixed(2)})`);
                         console.error("Fetched Transactions for Debug:", JSON.stringify(fetchedTransactionsForLog, null, 2));
                         throw new Error("Balance calculation error. There's a mismatch between your confirmed cashback and transaction history. Please contact support.");
                     }

                      // If sum is 0 but balance is not, it's an error state
                      if (sumOfTransactions === 0 && userBalanceInTransaction > 0) {
                         console.error(`Error: Profile balance is ₹${userBalanceInTransaction.toFixed(2)}, but no confirmed/unpaid transactions were found to sum up.`);
                         throw new Error("Data inconsistency detected. Please contact support.");
                      }

                     // Use the calculated sum as the definitive payout amount if checks pass
                     const finalPayoutAmount = sumOfTransactions;

                     console.log(`Proceeding with payout of ₹${finalPayoutAmount.toFixed(2)}`);

                     // 1. Create Payout Request Document
                     const payoutRequestRef = doc(collection(db, 'payoutRequests'));
                     console.log("Attempting to set payout request document...");
                     transaction.set(payoutRequestRef, {
                       userId: user.uid,
                       amount: finalPayoutAmount, // Use the validated sum
                       status: 'pending', // Initial status
                       requestedAt: serverTimestamp(),
                       processedAt: null,
                       paymentMethod: payoutDetails.method,
                       paymentDetails: payoutDetails,
                       transactionIds: transactionIdsToUpdate, // Link transactions to this payout
                       adminNotes: null,
                       failureReason: null,
                     });
                     console.log(`Payout request document prepared.`);

                     // 2. Link transactions to this payout request
                     console.log(`Attempting to update ${transactionIdsToUpdate.length} transactions with payoutId: ${payoutRequestRef.id}`);
                     transactionIdsToUpdate.forEach(txId => {
                       const txRef = doc(db, 'transactions', txId);
                       // IMPORTANT: Update status to 'pending_payout' or similar if needed by your logic,
                       // OR just link with payoutId. Setting payoutId is crucial.
                       transaction.update(txRef, { payoutId: payoutRequestRef.id, updatedAt: serverTimestamp() });
                     });
                     console.log("Transaction updates prepared.");

                     // 3. Update User Profile: Reset balance and set last request date
                     transaction.update(userDocRef, {
                         cashbackBalance: 0, // Reset balance to zero
                         lastPayoutRequestAt: serverTimestamp(), // Update last request time
                         payoutDetails: payoutDetails, // Save the details used for *this* request
                         updatedAt: serverTimestamp(),
                     });
                     console.log(`User profile update prepared (balance reset, last request updated).`);

                 }; // End of transactionFn

                 // Run the transaction
                 await runTransaction(db, transactionFn);
               } else {
                   throw new Error("Database not initialized.");
               }


               console.log(`Transaction committed successfully.`);


       toast({
         title: 'Payout Request Submitted',
         // Use the final calculated amount in the toast message
         description: `Your request for ${formatCurrency(availableBalance)} has been received and is pending approval. Your available balance is now ₹0.00.`,
       });

       // Reset form and local state after successful submission
       setAvailableBalance(0); // Reflect the balance change locally
       setCanRequest(false); // User can't request again immediately
       setLastRequestDate(new Date()); // Update last request date locally
       // Update local profile state as well
       setLatestUserProfile(prev => prev ? { ...prev, cashbackBalance: 0, lastPayoutRequestAt: new Date(), payoutDetails: payoutDetails } : null);


        // Optionally re-fetch user profile to get server-confirmed state,
        // though local update is usually sufficient for immediate UX.
        // await fetchUserProfile(user.uid).then(setLatestUserProfile);


     } catch (err: any) {
       console.error("Payout request failed:", err); // Log the full error
       // Don't reset balance locally on error
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
        <Alert variant="destructive" className="my-4">
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
                 {/* Display the locally managed availableBalance */}
                 {formatCurrency(availableBalance)}
                 {/* Add more sections as needed */}
             </span>
             </>
        </CardContent>
      </Card>

      {!canRequest && !loading && availableBalance < MIN_PAYOUT_AMOUNT && (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Payout Not Available</AlertTitle>
          <AlertDescription>
            You need at least {formatCurrency(MIN_PAYOUT_AMOUNT)} confirmed cashback to request a payout. Your current confirmed balance is {formatCurrency(availableBalance)}.
             <Button variant="link" className="p-0 h-auto ml-2" onClick={() => router.push('/stores')}>
                 Keep Shopping!
             </Button>
          </AlertDescription>
        </Alert>
      )}
       {/* Show slightly different message if balance IS sufficient but request was recent/pending */}
        {!canRequest && !loading && availableBalance >= MIN_PAYOUT_AMOUNT && (
          <Alert variant="info">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Payout Request Pending or Recent</AlertTitle>
              <AlertDescription>
                  You may have a pending payout request or have requested one recently. Please wait for it to be processed before requesting again.
              </AlertDescription>
          </Alert>
        )}

      {canRequest && (
        <Card>
          <CardHeader>
            <CardTitle>Payout Details</CardTitle>
            <CardDescription>Choose your preferred method and provide the necessary details. This will be saved for future requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={payoutForm.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="payoutMethod">Payout Method</Label>
                <Select
                  value={payoutForm.watch('payoutMethod')}
                  onValueChange={(value) => payoutForm.setValue('payoutMethod', value as PayoutMethod, { shouldValidate: true })} // Validate on change
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

