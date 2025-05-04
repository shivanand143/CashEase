// src/app/dashboard/payout/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, writeBatch, doc, getDocs, query, where, updateDoc, Timestamp, runTransaction, getDoc, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { PayoutRequest, Transaction, UserProfile } from '@/lib/types';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Send, Loader2, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from "@/lib/utils";

const MIN_PAYOUT_THRESHOLD = 250; // Example: ₹250

const payoutSchema = z.object({
  paymentMethod: z.string().min(1, { message: 'Please select a payment method' }),
  paymentDetails: z.string().min(1, { message: 'Payment details are required' }),
});

type PayoutFormValues = z.infer<typeof payoutSchema>;

export default function PayoutPage() {
  const { user, userProfile, loading: authLoading, fetchUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use optional chaining and nullish coalescing for safer access
  const availableBalance = userProfile?.cashbackBalance ?? 0;
  const canRequestPayout = availableBalance >= MIN_PAYOUT_THRESHOLD;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
     watch,
     reset,
  } = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutSchema),
     defaultValues: {
        paymentMethod: '',
        paymentDetails: '',
     },
  });

   const selectedPaymentMethod = watch('paymentMethod');

   // Fetch user profile function with useCallback for stability
    const stableFetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
       if (!db || !uid) return null;
       const userDocRef = doc(db, 'users', uid);
       try {
           const docSnap = await getDoc(userDocRef);
           if (docSnap.exists()) {
                const data = docSnap.data();
                 // Manual mapping to handle potential Timestamp conversion
                 const safeToDate = (fieldValue: any): Date | null => {
                    if (fieldValue instanceof Timestamp) return fieldValue.toDate();
                    if (fieldValue instanceof Date) return fieldValue;
                    return null;
                 };
                 return {
                     uid: docSnap.id,
                     email: data.email ?? null,
                     displayName: data.displayName ?? 'User',
                     photoURL: data.photoURL ?? null,
                     role: data.role ?? 'user',
                     cashbackBalance: typeof data.cashbackBalance === 'number' ? data.cashbackBalance : 0,
                     pendingCashback: typeof data.pendingCashback === 'number' ? data.pendingCashback : 0,
                     lifetimeCashback: typeof data.lifetimeCashback === 'number' ? data.lifetimeCashback : 0,
                     referralCode: data.referralCode ?? '',
                     referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
                     referralBonusEarned: typeof data.referralBonusEarned === 'number' ? data.referralBonusEarned : 0,
                     referredBy: data.referredBy ?? null,
                     isDisabled: typeof data.isDisabled === 'boolean' ? data.isDisabled : false,
                     createdAt: safeToDate(data.createdAt) || new Date(0),
                     updatedAt: safeToDate(data.updatedAt) || new Date(0),
                     lastPayoutRequestAt: safeToDate(data.lastPayoutRequestAt),
                     payoutDetails: data.payoutDetails ?? undefined,
                 } as UserProfile;
           } else {
               console.warn(`fetchUserProfile: No profile found for UID ${uid}`);
               return null;
           }
       } catch (error) {
           console.error(`Error fetching user profile for UID ${uid}:`, error);
           return null;
       }
   }, []);


  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to request a payout');
    } else if (!authLoading && user && userProfile) {
        // Fetch the latest profile data when the page loads to ensure accuracy
        stableFetchUserProfile(user.uid).then(latestProfile => {
            if (latestProfile && latestProfile.cashbackBalance < MIN_PAYOUT_THRESHOLD) {
                 toast({
                    variant: "destructive",
                    title: "Insufficient Balance",
                    description: `Your current balance is ₹${latestProfile.cashbackBalance.toFixed(2)}. You need ₹${MIN_PAYOUT_THRESHOLD}.`,
                 });
                 router.push('/dashboard');
            }
        });
    }
  }, [user, userProfile, authLoading, router, toast, stableFetchUserProfile]);


 const onSubmit = async (data: PayoutFormValues) => {
     if (!user) { // Removed userProfile check here, will fetch latest inside
       setError("Cannot process payout request. User not logged in.");
       return;
     }

     setIsSubmitting(true);
     setError(null);

     let latestUserProfile: UserProfile | null = null;
     let payoutAmount = 0;

     try {
        // Fetch the latest user profile data just before submitting
        latestUserProfile = await stableFetchUserProfile(user.uid);
        if (!latestUserProfile) {
           throw new Error("Could not verify user balance. Please try again.");
        }
        payoutAmount = latestUserProfile.cashbackBalance;
        console.log("Fetched latest profile balance for payout:", payoutAmount);

       // Re-check eligibility with the latest balance
        if (payoutAmount < MIN_PAYOUT_THRESHOLD) {
            throw new Error(`Your current balance (₹${payoutAmount.toFixed(2)}) is below the minimum payout threshold of ₹${MIN_PAYOUT_THRESHOLD}.`);
        }

       // Start Firestore Transaction
        await runTransaction(db, async (transaction) => {
             // Re-fetch user profile *within* the transaction for consistency check
             const userDocRef = doc(db, 'users', user.uid);
             const userSnap = await transaction.get(userDocRef);
             if (!userSnap.exists()) {
                 throw new Error("User profile not found during transaction.");
             }
             const profileInTransaction = userSnap.data() as UserProfile;
             const balanceInTransaction = profileInTransaction.cashbackBalance ?? 0;

             // Final check: ensure balance hasn't changed unexpectedly since initial fetch
             if (Math.abs(balanceInTransaction - payoutAmount) > 0.01) {
                  console.warn("Balance changed during payout process. Expected:", payoutAmount, "Actual:", balanceInTransaction);
                  throw new Error("Your balance changed during the request. Please review and try again.");
             }
             // Re-verify eligibility within transaction
             if (balanceInTransaction < MIN_PAYOUT_THRESHOLD) {
                throw new Error(`Balance (₹${balanceInTransaction.toFixed(2)}) dropped below threshold during request.`);
             }


             // 1. Find all 'confirmed' transactions for the user that haven't been paid out yet
             console.log(`Querying 'confirmed' transactions with payoutId == null for user ${user.uid}...`);
             const transactionsCollection = collection(db, 'transactions');
             const q = query(
                 transactionsCollection,
                 where('userId', '==', user.uid),
                 where('status', '==', 'confirmed'),
                 where('payoutId', '==', null) // Ensure we only get unpaid transactions
             );
             // Execute query *outside* transaction read phase if possible,
             // but if consistency is paramount, keep it inside. For this case,
             // reading inside is safer to ensure we lock the transactions being paid.
             const querySnapshot = await getDocs(q); // Read docs first
             console.log(`Found ${querySnapshot.size} 'confirmed' and unpaid transactions.`);

             const transactionIdsToUpdate: string[] = [];
             let sumOfTransactions = 0;

             querySnapshot.forEach((docSnap) => {
                 const txData = docSnap.data();
                 if (typeof txData.cashbackAmount === 'number' && txData.cashbackAmount > 0) { // Ensure amount is valid
                     transactionIdsToUpdate.push(docSnap.id);
                     sumOfTransactions += txData.cashbackAmount;
                     console.log(`  - Including Tx ID: ${docSnap.id}, Amount: ₹${txData.cashbackAmount.toFixed(2)}`);
                 } else {
                     console.warn(`Transaction ${docSnap.id} has missing, zero, or invalid cashbackAmount. Skipping.`);
                 }
             });

            console.log(`Total sum of queried 'confirmed' AND unpaid transactions: ₹${sumOfTransactions.toFixed(2)}`);
            console.log(`User profile available balance (within transaction): ₹${balanceInTransaction.toFixed(2)}`);

            // Strict validation: Ensure the sum exactly matches the available balance
            if (Math.abs(sumOfTransactions - balanceInTransaction) > 0.01) {
                 console.error(`CRITICAL MISMATCH (inside transaction): Sum (₹${sumOfTransactions.toFixed(2)}) vs Balance (₹${balanceInTransaction.toFixed(2)})`);
                 // Log details for debugging
                  console.error("Data mismatch details:", {
                     userId: user.uid,
                     calculatedSum: sumOfTransactions,
                     profileBalance: balanceInTransaction,
                     transactionsIncluded: transactionIdsToUpdate,
                  });
                 throw new Error("Balance calculation error. There's a mismatch between your confirmed cashback and transaction history. Please contact support immediately.");
            }

            // If balance is sufficient but no transactions found, it's an inconsistency
            if (balanceInTransaction >= MIN_PAYOUT_THRESHOLD && transactionIdsToUpdate.length === 0 && sumOfTransactions === 0) {
                const inconsistencyError = `Data Inconsistency: Available balance is ₹${balanceInTransaction.toFixed(2)}, but no corresponding unpaid confirmed transactions were found. Please contact support.`;
                console.error(inconsistencyError);
                throw new Error(inconsistencyError);
            }

             // --- Proceed with writes if checks pass ---

             // 2. Create the PayoutRequest document
             const payoutCollection = collection(db, 'payoutRequests');
             const newPayoutRequestRef = doc(payoutCollection);

             const payoutData: Omit<PayoutRequest, 'id'> = {
               userId: user.uid,
               amount: balanceInTransaction, // Use the balance confirmed within the transaction
               status: 'pending',
               requestedAt: serverTimestamp(),
               paymentMethod: data.paymentMethod,
               paymentDetails: { detail: data.paymentDetails },
               transactionIds: transactionIdsToUpdate,
               adminNotes: null,
               processedAt: null,
             };
             transaction.set(newPayoutRequestRef, payoutData);
             console.log(`Prepared PayoutRequest document: ${newPayoutRequestRef.id}`);

             // 3. Update the user's profile balance and last request time
             transaction.update(userDocRef, {
               cashbackBalance: 0,
               lastPayoutRequestAt: serverTimestamp(), // Record payout request time
               updatedAt: serverTimestamp()
             });
             console.log(`Prepared user profile balance update (set to 0) and last request time.`);

             // 4. Update the status of the included transactions to 'paid' and link them
             transactionIdsToUpdate.forEach(txId => {
                 const txDocRef = doc(db, 'transactions', txId);
                 // Use update within transaction
                 transaction.update(txDocRef, {
                     status: 'paid',
                     payoutId: newPayoutRequestRef.id,
                     paidDate: serverTimestamp() // Record when it was marked as paid
                 });
             });
             console.log(`Prepared to mark ${transactionIdsToUpdate.length} transactions as 'paid' and link to PayoutRequest ${newPayoutRequestRef.id}.`);

        }); // Firestore transaction ends

        console.log("Payout request transaction committed successfully.");
        toast({
          title: 'Payout Request Submitted',
          description: `Your request for ₹${payoutAmount.toFixed(2)} has been submitted for review.`,
        });
        router.push('/dashboard'); // Redirect after successful submission

     } catch (err: any) {
       console.error("Payout request failed:", err);
       setError(err.message || "An unexpected error occurred while submitting your payout request.");
       toast({
         variant: "destructive",
         title: 'Payout Failed',
         description: err.message || "Could not submit payout request. Please try again or contact support.",
          duration: 7000, // Show error longer
       });
     } finally {
       setIsSubmitting(false);
     }
 };

  if (authLoading || (!user && !authLoading)) {
      return <PayoutPageSkeleton />;
  }

   // Re-check after loading and profile fetch attempt
   if (!authLoading && user && !canRequestPayout && userProfile) {
       // This condition should ideally be caught by the useEffect redirect,
       // but kept as a safeguard display message if redirect fails.
       return (
           <Card className="w-full max-w-lg mx-auto">
               <CardHeader>
                   <CardTitle>Request Payout</CardTitle>
               </CardHeader>
               <CardContent>
                   <Alert variant="destructive">
                       <AlertCircle className="h-4 w-4" />
                       <AlertTitle>Insufficient Balance</AlertTitle>
                       <AlertDescription>
                           You need at least ₹{MIN_PAYOUT_THRESHOLD.toFixed(2)} available cashback to request a payout. Your current balance is ₹{availableBalance.toFixed(2)}.
                       </AlertDescription>
                   </Alert>
                   <Button onClick={() => router.push('/dashboard')} className="mt-4">Back to Dashboard</Button>
               </CardContent>
           </Card>
       );
   }


  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Request Payout</CardTitle>
        <CardDescription>
           Request a payout of your available cashback balance of <span className="font-bold text-primary">₹{availableBalance.toFixed(2)}</span>.
           Minimum payout amount is ₹{MIN_PAYOUT_THRESHOLD.toFixed(2)}.
           Please ensure your payment details are correct.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
         {error && (
           <Alert variant="destructive">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
           </Alert>
         )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
           <div className="space-y-2">
               <Label htmlFor="paymentMethod">Payment Method *</Label>
                 <Controller
                    name="paymentMethod"
                    control={control}
                    render={({ field }) => (
                         <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={isSubmitting}
                         >
                             <SelectTrigger id="paymentMethod" aria-invalid={errors.paymentMethod ? "true" : "false"}>
                                 <SelectValue placeholder="Select a method" />
                             </SelectTrigger>
                             <SelectContent>
                                 <SelectItem value="paypal">PayPal</SelectItem>
                                 <SelectItem value="bank_transfer">Bank Transfer (India - UPI/NEFT)</SelectItem>
                                 <SelectItem value="gift_card">Gift Card (e.g., Amazon)</SelectItem>
                             </SelectContent>
                         </Select>
                     )}
                 />
                 {errors.paymentMethod && <p className="text-sm text-destructive mt-1">{errors.paymentMethod.message}</p>}
           </div>

          {selectedPaymentMethod && (
             <div className="space-y-2">
               <Label htmlFor="paymentDetails">
                  {selectedPaymentMethod === 'paypal' && 'PayPal Email Address *'}
                  {selectedPaymentMethod === 'bank_transfer' && 'Bank Account Details / UPI ID *'}
                  {selectedPaymentMethod === 'gift_card' && 'Gift Card Preference / Email *'}
                  {!['paypal', 'bank_transfer', 'gift_card'].includes(selectedPaymentMethod) && 'Payment Details *'}
               </Label>
                <Textarea
                   id="paymentDetails"
                   placeholder={
                      selectedPaymentMethod === 'paypal' ? 'your.email@example.com' :
                      selectedPaymentMethod === 'bank_transfer' ? 'Enter Account #, IFSC Code, Account Holder Name or UPI ID' :
                      selectedPaymentMethod === 'gift_card' ? 'Enter email for gift card delivery' :
                      'Enter necessary payment details'
                   }
                   {...register('paymentDetails')}
                   disabled={isSubmitting}
                   aria-invalid={errors.paymentDetails ? "true" : "false"}
                   rows={3}
                 />
                 {errors.paymentDetails && <p className="text-sm text-destructive mt-1">{errors.paymentDetails.message}</p>}
                  {selectedPaymentMethod === 'bank_transfer' && (
                     <p className='text-xs text-muted-foreground'>Please double-check bank details for accuracy.</p>
                  )}
             </div>
           )}

          <Button type="submit" className="w-full" disabled={isSubmitting || !selectedPaymentMethod || !userProfile || !canRequestPayout}>
            {isSubmitting ? (
              <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting... </>
            ) : (
              <> <Send className="mr-2 h-4 w-4" /> Submit Payout Request (₹{availableBalance.toFixed(2)}) </>
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
         <p>Payout requests are reviewed by admins. You will be notified once processed. Ensure your details are accurate to avoid delays.</p>
      </CardFooter>
    </Card>
  );
}

function PayoutPageSkeleton() {
    return (
        <Card className="w-full max-w-lg mx-auto">
          <CardHeader>
             <Skeleton className="h-7 w-3/4 mb-2" />
             <Skeleton className="h-4 w-full mb-1" />
             <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="space-y-2">
                 <Skeleton className="h-4 w-24" />
                 <Skeleton className="h-10 w-full" />
              </div>
               <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-20 w-full" />
               </div>
               <Skeleton className="h-10 w-full" />
          </CardContent>
           <CardFooter>
              <Skeleton className="h-3 w-full" />
           </CardFooter>
        </Card>
    );
}
