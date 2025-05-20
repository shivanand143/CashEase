
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

const MIN_PAYOUT_AMOUNT = 250; // Minimum amount a user can request

// Zod schema for payout form validation
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
    mode: "onChange",
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
      if (userProfile) {
        if (isMounted) {
          const balance = userProfile.cashbackBalance || 0;
          setCurrentBalance(parseFloat(balance.toFixed(2)));
          setValue('amount', parseFloat(Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT)).toFixed(2)), { shouldValidate: true });
          if (userProfile.payoutDetails) {
            setValue('payoutMethod', userProfile.payoutDetails.method);
            setValue('payoutDetail', userProfile.payoutDetails.detail);
          }
          setLoadingProfile(false);
          setCanRequest(balance >= MIN_PAYOUT_AMOUNT);
        }
      } else if (!authLoading && user) {
        // If auth is done but profile is still null, try fetching again
        console.log("PayoutPage: userProfile is null, attempting to fetch.");
        try {
            const fetchedProfile = await fetchUserProfile(user.uid);
            if (fetchedProfile && isMounted) {
                const balance = fetchedProfile.cashbackBalance || 0;
                setCurrentBalance(parseFloat(balance.toFixed(2)));
                setValue('amount', parseFloat(Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT)).toFixed(2)), { shouldValidate: true });
                if (fetchedProfile.payoutDetails) {
                    setValue('payoutMethod', fetchedProfile.payoutDetails.method);
                    setValue('payoutDetail', fetchedProfile.payoutDetails.detail);
                }
                setLoadingProfile(false);
                setCanRequest(balance >= MIN_PAYOUT_AMOUNT);
            } else if (isMounted) {
                console.error("PayoutPage: Failed to fetch profile on mount.");
                setPageError("Could not load your profile data for payout.");
                setLoadingProfile(false);
                setCanRequest(false);
            }
        } catch (err) {
            if (isMounted) {
                console.error("PayoutPage: Error fetching profile on mount:", err);
                setPageError("Error loading profile data.");
                setLoadingProfile(false);
                setCanRequest(false);
            }
        }
      } else if (!authLoading && !user) {
        if (isMounted) {
          setLoadingProfile(false);
          setCanRequest(false);
          router.push('/login?message=Please login to request a payout.');
        }
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
    const requestedPayoutAmount = data.amount;

    const payoutDetails: PayoutDetails = {
      method: data.payoutMethod as PayoutMethod,
      detail: data.payoutDetail,
    };

    try {
      await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await transaction.get(userDocRef);

        if (!userDocSnap.exists()) {
          throw new Error("User profile not found. Please ensure you are logged in correctly.");
        }
        const currentUserData = userDocSnap.data() as UserProfile;
        const currentFreshBalance = currentUserData.cashbackBalance || 0;

        if (requestedPayoutAmount > currentFreshBalance) {
          throw new Error(`Requested amount (₹${requestedPayoutAmount.toFixed(2)}) exceeds your current available balance (₹${currentFreshBalance.toFixed(2)}). Your balance may have updated. Please refresh.`);
        }
        if (requestedPayoutAmount < MIN_PAYOUT_AMOUNT) {
          throw new Error(`Minimum payout amount is ${formatCurrency(MIN_PAYOUT_AMOUNT)}.`);
        }

        // Fetch confirmed transactions that have not been paid out yet
        const transactionsCollection = collection(db, 'transactions');
        const confirmedUnpaidQuery = query(
          transactionsCollection,
          where('userId', '==', user.uid),
          where('status', '==', 'confirmed'),
          where('payoutId', '==', null),
          orderBy('transactionDate', 'asc')
        );

        const confirmedTransactionsSnap = await getDocs(confirmedUnpaidQuery); // Read outside transaction if possible, or simplify logic

        let sumOfSelectedTransactions = 0;
        const transactionIdsToUpdate: string[] = [];

        for (const docSnap of confirmedTransactionsSnap.docs) {
          const txData = docSnap.data() as Transaction;
          const cashbackAmt = txData.finalCashbackAmount ?? txData.initialCashbackAmount ?? 0;
          if (cashbackAmt > 0 && (sumOfSelectedTransactions + cashbackAmt) <= requestedPayoutAmount) {
            sumOfSelectedTransactions += cashbackAmt;
            transactionIdsToUpdate.push(docSnap.id);
          }
          if (sumOfSelectedTransactions >= requestedPayoutAmount) break; // Stop if we've covered the amount
        }
        sumOfSelectedTransactions = parseFloat(sumOfSelectedTransactions.toFixed(2));

        // If we couldn't gather enough transaction value to cover the requested amount
        if (sumOfSelectedTransactions < requestedPayoutAmount) {
          throw new Error(`Not enough confirmed transaction value (found ₹${sumOfSelectedTransactions.toFixed(2)}) to fulfill this specific payout request of ₹${requestedPayoutAmount.toFixed(2)}. Please try a smaller amount or wait for more transactions to be confirmed.`);
        }

        // Create Payout Request Document
        const payoutRequestRef = doc(collection(db, 'payoutRequests'));
        transaction.set(payoutRequestRef, {
          userId: user.uid,
          amount: requestedPayoutAmount, // The amount the user requested
          status: 'pending',
          requestedAt: serverTimestamp(),
          processedAt: null,
          paymentMethod: payoutDetails.method,
          paymentDetails: payoutDetails,
          transactionIds: transactionIdsToUpdate,
          adminNotes: null,
          failureReason: null,
        });

        // Update User's Profile
        transaction.update(userDocRef, {
          cashbackBalance: increment(-requestedPayoutAmount), // Decrement by the requested amount
          lastPayoutRequestAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          payoutDetails: payoutDetails, // Save/update user's payout details
        });

        // Update Selected Transactions
        const payoutId = payoutRequestRef.id;
        for (const txId of transactionIdsToUpdate) {
          const txRef = doc(db, 'transactions', txId);
          transaction.update(txRef, { status: 'awaiting_payout' as CashbackStatus, payoutId: payoutId, updatedAt: serverTimestamp() });
        }
      });

      toast({
        title: "Payout Request Submitted",
        description: `Your request for ${formatCurrency(requestedPayoutAmount)} is being processed.`,
      });
      reset({ amount: MIN_PAYOUT_AMOUNT, payoutDetail: data.payoutDetail, payoutMethod: data.payoutMethod }); // Reset form, keep payout details for convenience
      
      // Fetch and update user profile to reflect new balance
      const updatedProfile = await fetchUserProfile(user.uid);
      if (updatedProfile) {
         const newBalance = updatedProfile.cashbackBalance || 0;
         setCurrentBalance(parseFloat(newBalance.toFixed(2)));
         setCanRequest(newBalance >= MIN_PAYOUT_AMOUNT);
      } else {
         setCurrentBalance(0);
         setCanRequest(false);
      }

    } catch (err: any) {
      console.error("Payout request failed:", err);
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
                <p><strong>Source:</strong> Payouts are made from your 'Confirmed' cashback balance.</p>
                <p><strong>Processing Time:</strong> Requests are typically processed within 3-5 business days.</p>
                <p><strong>Accuracy:</strong> Please ensure your payout details are correct to avoid delays or issues.</p>
                <p><strong>Transaction Linking:</strong> When you request a payout, we will allocate specific confirmed transactions from your history to cover the amount. These transactions will be marked as 'Awaiting Payout'.</p>
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
              You need at least {formatCurrency(MIN_PAYOUT_AMOUNT)} in available cashback to request a payout. Keep shopping to earn more!
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
                  <Label htmlFor="amount">Amount to Withdraw (₹)</Label>
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

    