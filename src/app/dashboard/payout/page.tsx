
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
  QueryConstraint,
  DocumentData,
  getDoc,
  Query,
  increment
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails, PayoutMethod, Transaction, CashbackStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { AlertCircle, IndianRupee, Send, Loader2, Info, ListChecks, ShieldCheck } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Skeleton } from '@/components/ui/skeleton';

const MIN_PAYOUT_AMOUNT = 250;

const payoutSchemaBase = z.object({
  payoutMethod: z.enum(['bank_transfer', 'paypal', 'gift_card'] as [PayoutMethod, ...PayoutMethod[]], {
    required_error: "Please select a payout method.",
  }),
  payoutDetail: z.string().min(5, { message: "Payout details must be at least 5 characters." })
    .max(200, { message: "Payout details are too long." }),
  amount: z.number({
    required_error: "Amount is required.",
    invalid_type_error: "Amount must be a number.",
  }).positive({ message: "Amount must be positive." })
    .min(MIN_PAYOUT_AMOUNT, { message: `Minimum payout amount is ${formatCurrency(MIN_PAYOUT_AMOUNT)}.` })
});

type PayoutFormValues = z.infer<typeof payoutSchemaBase>;

function PayoutPageSkeleton() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <Skeleton className="h-9 w-1/3" /> {/* Title */}

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" /> {/* Card Title */}
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-1/2" /> {/* Balance display */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" />
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
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
       <Card>
        <CardHeader><Skeleton className="h-6 w-1/3 mb-2" /></CardHeader>
        <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function PayoutPage() {
  const { user, userProfile, loading: authLoading, fetchUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [currentBalance, setCurrentBalance] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [canRequest, setCanRequest] = useState(false);

  const dynamicPayoutSchema = payoutSchemaBase.refine(
    (data) => data.amount <= currentBalance,
    {
      message: "Requested amount cannot exceed your available balance.",
      path: ["amount"],
    }
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isValid: isFormValid, isDirty },
  } = useForm<PayoutFormValues>({
    resolver: zodResolver(dynamicPayoutSchema),
    mode: "onChange", // Validate on change to enable/disable button correctly
    defaultValues: {
      payoutMethod: undefined,
      payoutDetail: '',
      amount: MIN_PAYOUT_AMOUNT,
    },
  });

  const requestedAmount = watch("amount");

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      if (!isMounted) return;
      if (userProfile) {
        const balance = userProfile.cashbackBalance || 0;
        setCurrentBalance(parseFloat(balance.toFixed(2)));
        // Set initial amount, respecting min and max
        const initialAmount = Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT));
        setValue('amount', parseFloat(initialAmount.toFixed(2)), { shouldValidate: true });

        if (userProfile.payoutDetails) {
          setValue('payoutMethod', userProfile.payoutDetails.method);
          setValue('payoutDetail', userProfile.payoutDetails.detail);
        }
        setLoadingProfile(false);
        setCanRequest(balance >= MIN_PAYOUT_AMOUNT);
      } else if (!authLoading && user) {
        console.log("PAYOUT_PAGE: userProfile is null, attempting to fetch.");
        try {
            const fetchedProfile = await fetchUserProfile(user.uid);
            if (fetchedProfile && isMounted) {
                const balance = fetchedProfile.cashbackBalance || 0;
                setCurrentBalance(parseFloat(balance.toFixed(2)));
                const initialAmount = Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT));
                setValue('amount', parseFloat(initialAmount.toFixed(2)), { shouldValidate: true });
                if (fetchedProfile.payoutDetails) {
                    setValue('payoutMethod', fetchedProfile.payoutDetails.method);
                    setValue('payoutDetail', fetchedProfile.payoutDetails.detail);
                }
                setLoadingProfile(false);
                setCanRequest(balance >= MIN_PAYOUT_AMOUNT);
            } else if (isMounted) {
                console.error("PAYOUT_PAGE: Failed to fetch profile on mount.");
                setPageError("Could not load your profile data for payout.");
                setLoadingProfile(false);
                setCanRequest(false);
            }
        } catch (err) {
            if (isMounted) {
                console.error("PAYOUT_PAGE: Error fetching profile on mount:", err);
                setPageError("Error loading profile data.");
                setLoadingProfile(false);
                setCanRequest(false);
            }
        }
      } else if (!authLoading && !user && isMounted) {
          setLoadingProfile(false);
          setCanRequest(false);
          router.push('/login?message=Please login to request a payout.');
      }
    };
    loadProfile();
    return () => { isMounted = false; };
  }, [userProfile, authLoading, user, fetchUserProfile, router, setValue]);


  const onSubmit = async (data: PayoutFormValues) => {
    if (!user || !userProfile || !db || firebaseInitializationError) {
      setPageError("User not authenticated or database not available.");
      toast({ variant: "destructive", title: "Error", description: "Could not process request." });
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    const requestedPayoutAmount = data.amount; // Amount user wants

    const payoutDetails: PayoutDetails = {
      method: data.payoutMethod as PayoutMethod,
      detail: data.payoutDetail,
    };

    try {
      // Fetch confirmed transactions that have not been paid out yet
      // This is done OUTSIDE the Firestore transaction because queries with 'in', 'array-contains-any', or multiple inequality filters
      // are not allowed directly inside transactions. We fetch the IDs first.
      console.log(`PAYOUT_PAGE: Attempting to fetch confirmed, unpaid transactions for user ${user.uid} to cover ₹${requestedPayoutAmount.toFixed(2)}`);
      const transactionsCollection = collection(db, 'transactions');
      const confirmedUnpaidQuery = query(
          transactionsCollection,
          where('userId', '==', user.uid),
          where('status', '==', 'confirmed'),
          where('payoutId', '==', null), // Only transactions not yet part of any payout
          orderBy('transactionDate', 'asc') // Process older transactions first
      );

      const confirmedTransactionsSnap = await getDocs(confirmedUnpaidQuery);
      console.log(`PAYOUT_PAGE: Fetched ${confirmedTransactionsSnap.size} 'confirmed' and unpaid transactions to verify payout amount.`);

      let sumOfSelectedTransactions = 0;
      const transactionIdsToIncludeInPayout: string[] = [];

      for (const docSnap of confirmedTransactionsSnap.docs) {
          const txData = docSnap.data() as Transaction;
          const cashbackAmt = Number(txData.cashbackAmount); // Ensure it's a number

          if (isNaN(cashbackAmt) || cashbackAmt <= 0) {
            console.warn(`PAYOUT_PAGE: Transaction ${docSnap.id} has invalid or zero cashbackAmount (₹${txData.cashbackAmount}). Skipping.`);
            continue;
          }

          // Add transaction if it doesn't exceed the requested amount
          if ((sumOfSelectedTransactions + cashbackAmt) <= requestedPayoutAmount) {
              sumOfSelectedTransactions += cashbackAmt;
              transactionIdsToIncludeInPayout.push(docSnap.id);
              console.log(`PAYOUT_PAGE: Selected Tx ID: ${docSnap.id}, Amount: ₹${cashbackAmt.toFixed(2)}. Current sum: ₹${sumOfSelectedTransactions.toFixed(2)}`);
          } else {
              // If adding this transaction exceeds the request, try to see if it's the *only* one that could partially fill
              // For simplicity now, we aim for exact or just under for the sum of *selected* Txs.
              // A more complex logic could try to find a combination.
              // For now, if the next one overshoots, we might stop if already close.
              console.log(`PAYOUT_PAGE: Tx ID: ${docSnap.id} (₹${cashbackAmt.toFixed(2)}) would exceed requested ₹${requestedPayoutAmount.toFixed(2)} with current sum ₹${sumOfSelectedTransactions.toFixed(2)}. Checking if smaller Txs can fill.`);
          }

          if (sumOfSelectedTransactions >= requestedPayoutAmount) {
              break; // We have enough transaction value
          }
      }
      sumOfSelectedTransactions = parseFloat(sumOfSelectedTransactions.toFixed(2));
      console.log(`PAYOUT_PAGE: Final sum of selected transactions: ₹${sumOfSelectedTransactions.toFixed(2)} for requested amount ₹${requestedPayoutAmount.toFixed(2)}`);


      if (sumOfSelectedTransactions < requestedPayoutAmount) {
          const errorMsg = confirmedTransactionsSnap.empty
            ? `No confirmed and unpaid transactions found. Your balance of ${formatCurrency(currentBalance)} might be from a previous update that needs reconciliation.`
            : `Could not gather enough confirmed transaction value (found ₹${sumOfSelectedTransactions.toFixed(2)}) to fulfill your request of ₹${requestedPayoutAmount.toFixed(2)}. This might be due to the specific amounts of your confirmed transactions. Please try requesting ₹${sumOfSelectedTransactions.toFixed(2)} or contact support if your balance seems incorrect.`;
          console.error("PAYOUT_PAGE:", errorMsg);
          throw new Error(errorMsg);
      }
      
      const finalPayoutAmount = sumOfSelectedTransactions; // This is the actual amount that will be paid based on selected transactions

      if (finalPayoutAmount < MIN_PAYOUT_AMOUNT) {
        throw new Error(`The actual amount that can be formed from your transactions (₹${finalPayoutAmount.toFixed(2)}) is less than the minimum payout of ${formatCurrency(MIN_PAYOUT_AMOUNT)}.`);
      }


      // Now, run the Firestore transaction to update documents
      await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await transaction.get(userDocRef); // Read user profile within transaction

        if (!userDocSnap.exists()) {
          throw new Error("User profile not found. Critical error.");
        }
        const currentUserData = userDocSnap.data() as UserProfile;
        const currentFreshBalance = currentUserData.cashbackBalance || 0;

        // Final check: ensure the amount derived from transactions doesn't exceed fresh balance
        if (finalPayoutAmount > currentFreshBalance) {
          console.error(`PAYOUT_PAGE: CRITICAL MISMATCH INSIDE TRANSACTION! Selected Tx sum (₹${finalPayoutAmount.toFixed(2)}) > fresh user balance (₹${currentFreshBalance.toFixed(2)})`);
          throw new Error("A critical balance inconsistency was detected. Please contact support immediately.");
        }

        // 1. Create Payout Request Document
        const payoutRequestRef = doc(collection(db, 'payoutRequests'));
        transaction.set(payoutRequestRef, {
          userId: user.uid,
          amount: finalPayoutAmount, // Use the sum of selected transactions
          status: 'pending',
          requestedAt: serverTimestamp(),
          processedAt: null,
          paymentMethod: payoutDetails.method,
          paymentDetails: payoutDetails,
          transactionIds: transactionIdsToIncludeInPayout,
          adminNotes: null,
          failureReason: null,
        });
        console.log(`PAYOUT_PAGE: PayoutRequest document created with ID: ${payoutRequestRef.id} for amount ₹${finalPayoutAmount.toFixed(2)}`);

        // 2. Update User's Profile
        transaction.update(userDocRef, {
          cashbackBalance: increment(-finalPayoutAmount), // Decrement by the actual payout amount
          lastPayoutRequestAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          payoutDetails: payoutDetails, // Save/update user's payout details
        });
        console.log(`PAYOUT_PAGE: User ${user.uid} profile updated. cashbackBalance decremented by ₹${finalPayoutAmount.toFixed(2)}.`);

        // 3. Update Selected Transactions
        const payoutId = payoutRequestRef.id;
        for (const txId of transactionIdsToIncludeInPayout) {
          const txRef = doc(db, 'transactions', txId);
          transaction.update(txRef, { status: 'awaiting_payout' as CashbackStatus, payoutId: payoutId, updatedAt: serverTimestamp() });
        }
        console.log(`PAYOUT_PAGE: ${transactionIdsToIncludeInPayout.length} transactions updated to 'awaiting_payout' with payoutId ${payoutId}.`);
      });

      toast({
        title: "Payout Request Submitted",
        description: `Your request for ${formatCurrency(finalPayoutAmount)} is being processed.`,
      });
      reset({ amount: MIN_PAYOUT_AMOUNT, payoutDetail: data.payoutDetail, payoutMethod: data.payoutMethod });

      const updatedProfile = await fetchUserProfile(user.uid);
      if (updatedProfile) {
         const newBalance = updatedProfile.cashbackBalance || 0;
         setCurrentBalance(parseFloat(newBalance.toFixed(2)));
         setCanRequest(newBalance >= MIN_PAYOUT_AMOUNT);
      } else {
         setCurrentBalance(0);
         setCanRequest(false);
      }
      console.log(`PAYOUT_PAGE: Payout processing completed successfully. Final Payout Amount: ₹${finalPayoutAmount.toFixed(2)}`);

    } catch (err: any) {
      console.error("PAYOUT_PAGE: Payout request submission failed:", err);
      setPageError(err.message || "Failed to submit payout request.");
      toast({ variant: "destructive", title: "Payout Failed", description: err.message || "Could not submit your request." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || loadingProfile) {
    return <ProtectedRoute><PayoutPageSkeleton /></ProtectedRoute>;
  }
  
  return (
    <ProtectedRoute>
      <div className="space-y-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Send className="w-7 h-7 text-primary" /> Request Payout
        </h1>

        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><IndianRupee className="w-6 h-6 text-primary"/> Your Available Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary">
              {formatCurrency(currentBalance)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListChecks className="w-6 h-6 text-primary"/> Payout Rules & Information</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                <p><strong>Minimum Payout:</strong> You need at least {formatCurrency(MIN_PAYOUT_AMOUNT)} in confirmed cashback to request a payout.</p>
                <p><strong>Source:</strong> Payouts are made from your 'Confirmed' cashback balance, which is derived from your approved transactions.</p>
                <p><strong>Processing Time:</strong> Requests are typically processed within 3-5 business days.</p>
                <p><strong>Accuracy:</strong> Please ensure your payout details are correct to avoid delays or issues.</p>
                <p><strong>Transaction Linking:</strong> When you request a payout, we will allocate specific confirmed transactions from your history to cover the amount. These transactions will be marked as 'Awaiting Payout'. The actual payout amount might be adjusted to match the sum of these transactions if it's less than your requested amount but still meets the minimum.</p>
            </CardContent>
        </Card>


        {pageError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        {!canRequest && !authLoading && !loadingProfile && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Minimum Payout Not Met</AlertTitle>
            <AlertDescription>
              You need at least {formatCurrency(MIN_PAYOUT_AMOUNT)} in available cashback to request a payout. Your current available balance is {formatCurrency(currentBalance)}. Keep shopping to earn more!
            </AlertDescription>
          </Alert>
        )}

        {canRequest && (
          <Card className="shadow-md border">
            <CardHeader>
              <CardTitle>Payout Details</CardTitle>
              <CardDescription>Select your preferred method and provide details. Amount requested must be between {formatCurrency(MIN_PAYOUT_AMOUNT)} and {formatCurrency(currentBalance)}.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <Label htmlFor="amount">Amount to Withdraw (₹)*</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    {...register('amount', { valueAsNumber: true })}
                    placeholder={`Min ${formatCurrency(MIN_PAYOUT_AMOUNT)}`}
                    disabled={isSubmitting}
                    className={errors.amount ? "border-destructive" : ""}
                  />
                  {errors.amount && <p className="text-sm text-destructive mt-1">{errors.amount.message}</p>}
                </div>

                <div>
                  <Label className="mb-2 block">Payout Method*</Label>
                  <Controller
                    name="payoutMethod"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                        aria-label="Payout Method"
                      >
                        {(['bank_transfer', 'paypal', 'gift_card'] as PayoutMethod[]).map((method) => (
                          <Label
                            key={method}
                            htmlFor={`payout-settings-${method}`}
                            className={`flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                              field.value === method ? "border-primary ring-2 ring-primary" : ""
                            }`}
                          >
                            <RadioGroupItem value={method} id={`payout-settings-${method}`} className="sr-only" />
                            <span className="font-semibold capitalize mb-1 text-sm">{method.replace('_', ' ')}</span>
                            <span className="text-xs text-muted-foreground text-center">
                              {method === 'bank_transfer' && 'Direct to Bank/UPI'}
                              {method === 'paypal' && 'To PayPal Account'}
                              {method === 'gift_card' && 'e.g., Amazon Card'}
                            </span>
                          </Label>
                        ))}
                      </RadioGroup>
                    )}
                  />
                  {errors.payoutMethod && <p className="text-sm text-destructive mt-1">{errors.payoutMethod.message}</p>}
                </div>

                <div>
                  <Label htmlFor="payoutDetail">
                    {watch('payoutMethod') === 'bank_transfer' && 'Bank Account No, IFSC, Name / UPI ID*'}
                    {watch('payoutMethod') === 'paypal' && 'PayPal Email Address*'}
                    {watch('payoutMethod') === 'gift_card' && 'Preferred Gift Card & Email to send*'}
                    {!watch('payoutMethod') && 'Payment Details*'}
                  </Label>
                  <Textarea
                    id="payoutDetail"
                    {...register('payoutDetail')}
                    placeholder={
                      watch('payoutMethod') === 'bank_transfer' ? 'e.g., Account No, IFSC, Name or yourname@upi' :
                      watch('payoutMethod') === 'paypal' ? 'your.paypal.email@example.com' :
                      watch('payoutMethod') === 'gift_card' ? 'e.g., Amazon Gift Card to myemail@example.com' :
                      'Enter relevant details here...'
                    }
                    rows={3}
                    disabled={isSubmitting}
                    className={errors.payoutDetail ? "border-destructive" : ""}
                  />
                  {errors.payoutDetail && <p className="text-sm text-destructive mt-1">{errors.payoutDetail.message}</p>}
                </div>

                <Button type="submit" disabled={isSubmitting || !canRequest || !isFormValid || !isDirty} className="w-full">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                  Request Payout of {formatCurrency(requestedAmount || 0)}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  );
}

