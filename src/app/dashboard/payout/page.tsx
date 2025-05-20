
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
  Query
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
import { AlertCircle, IndianRupee, Send, Loader2, Info } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Skeleton } from '@/components/ui/skeleton';

const MIN_PAYOUT_AMOUNT = 250;

const payoutSchemaBase = z.object({
  payoutMethod: z.enum(['bank_transfer', 'paypal', 'gift_card'], {
    required_error: "Please select a payout method.",
  }),
  payoutDetail: z.string().min(5, { message: "Payout details must be at least 5 characters." })
    .max(200, { message: "Payout details are too long." }),
  amount: z.number({
    required_error: "Amount is required.",
    invalid_type_error: "Amount must be a number.",
  }).positive({ message: "Amount must be positive." })
    .min(MIN_PAYOUT_AMOUNT, { message: `Minimum payout amount is ₹${MIN_PAYOUT_AMOUNT}.` })
});

// Type for form values
type PayoutFormValues = z.infer<typeof payoutSchemaBase>;

function PayoutPageSkeleton() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <Skeleton className="h-9 w-1/3" /> {/* Title */}

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" /> {/* Card Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Card Description */}
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-1/2" /> {/* Balance display */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input/Select */}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input */}
          </div>
          <Skeleton className="h-10 w-full" /> {/* Button */}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PayoutPage() {
  const { user, userProfile, loading: authLoading, fetchUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [availableBalance, setAvailableBalance] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Dynamic schema for amount validation based on availableBalance
  const dynamicPayoutSchema = payoutSchemaBase.refine(
    (data) => data.amount <= availableBalance,
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
    formState: { errors, isValid: isFormValid, isDirty },
  } = useForm<PayoutFormValues>({
    resolver: zodResolver(dynamicPayoutSchema), // Use dynamic schema
    mode: "onChange", // Validate on change for better UX with amount
    defaultValues: {
      payoutMethod: undefined,
      payoutDetail: userProfile?.payoutDetails?.detail || '',
      amount: MIN_PAYOUT_AMOUNT,
    },
  });

  const requestedAmount = watch("amount");

  useEffect(() => {
    if (userProfile) {
      const balance = userProfile.cashbackBalance || 0;
      setAvailableBalance(parseFloat(balance.toFixed(2)));
      if (userProfile.payoutDetails) {
        reset({
          payoutMethod: userProfile.payoutDetails.method,
          payoutDetail: userProfile.payoutDetails.detail,
          amount: parseFloat(Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT)).toFixed(2)) // Sensible default for amount
        });
      } else {
        reset({
          amount: parseFloat(Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT)).toFixed(2))
        });
      }
      setLoadingProfile(false);
    } else if (!authLoading) {
      setLoadingProfile(false);
    }
  }, [userProfile, authLoading, reset]);


  const onSubmit = async (data: PayoutFormValues) => {
    if (!user || !userProfile || !db || firebaseInitializationError) {
      setPageError("User not authenticated or database not available.");
      toast({ variant: "destructive", title: "Error", description: "Could not process request." });
      return;
    }

    // Re-check balance just before submission inside transaction
    const requestedPayoutAmount = data.amount;

    if (requestedPayoutAmount < MIN_PAYOUT_AMOUNT) {
        setPageError(`Minimum payout amount of ₹${MIN_PAYOUT_AMOUNT} not met.`);
        toast({ variant: "destructive", title: "Payout Error", description: `Minimum payout amount is ₹${MIN_PAYOUT_AMOUNT}.` });
        return;
    }

    setIsSubmitting(true);
    setPageError(null);

    const payoutDetails: PayoutDetails = {
      method: data.payoutMethod as PayoutMethod,
      detail: data.payoutDetail,
    };

    try {
      await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await transaction.get(userDocRef);

        if (!userDocSnap.exists()) {
          throw new Error("User profile not found.");
        }
        const currentUserData = userDocSnap.data() as UserProfile;
        const currentBalance = currentUserData.cashbackBalance || 0;

        if (requestedPayoutAmount > currentBalance) {
          throw new Error(`Requested amount (₹${requestedPayoutAmount.toFixed(2)}) exceeds your current available balance (₹${currentBalance.toFixed(2)}). Please refresh and try again.`);
        }
        if (requestedPayoutAmount < MIN_PAYOUT_AMOUNT) {
          throw new Error(`Minimum payout amount is ₹${MIN_PAYOUT_AMOUNT}.`);
        }

        // Fetch confirmed transactions that have not been paid out yet, up to the requested amount
        const transactionsCollection = collection(db, 'transactions');
        const confirmedUnpaidQuery = query(
          transactionsCollection,
          where('userId', '==', user.uid),
          where('status', '==', 'confirmed'),
          where('payoutId', '==', null), // Only transactions not yet part of any payout
          orderBy('transactionDate', 'asc') // Process older transactions first
        );

        let confirmedTransactionsSnap;
        try {
          confirmedTransactionsSnap = await getDocs(confirmedUnpaidQuery); // Use getDocs directly within transaction for reads if needed, or pass snapshot if large
        } catch (getQueryError: any) {
          console.error("Error during getDocs(query) for transactions:", getQueryError);
          throw new Error("Failed to fetch confirmed transactions for payout verification.");
        }
        console.log(`Found ${confirmedTransactionsSnap.size} 'confirmed' and unpaid transactions.`);

        let sumOfTransactionsToPayout = 0;
        const transactionIdsToUpdate: string[] = [];

        for (const docSnap of confirmedTransactionsSnap.docs) {
          const txData = docSnap.data() as Transaction;
          const cashbackAmt = txData.finalCashbackAmount ?? txData.initialCashbackAmount ?? 0;
          if (sumOfTransactionsToPayout + cashbackAmt <= requestedPayoutAmount) {
            sumOfTransactionsToPayout += cashbackAmt;
            transactionIdsToUpdate.push(docSnap.id);
          } else if (sumOfTransactionsToPayout < requestedPayoutAmount) {
            // This case is complex (partial transaction use) and generally avoided
            // For simplicity, we'll only include full transactions up to the amount
            // Or, error out if a perfect match isn't possible without splitting a transaction
            console.warn("Could not find exact transaction match for requested amount. Considering only full transactions.");
            break; 
          }
          if (sumOfTransactionsToPayout >= requestedPayoutAmount) break;
        }
        sumOfTransactionsToPayout = parseFloat(sumOfTransactionsToPayout.toFixed(2));

        // Critical validation: The sum of transactions to be paid out *must* equal the requested amount.
        // This prevents over/under payment.
        if (Math.abs(sumOfTransactionsToPayout - requestedPayoutAmount) > 0.01) {
          console.error(`Payout amount calculation error: Requested ₹${requestedPayoutAmount.toFixed(2)}, but transactions sum to ₹${sumOfTransactionsToPayout.toFixed(2)}.`);
          throw new Error("Could not match exact payout amount with available transactions. Please try requesting a slightly different amount or contact support.");
        }
        
        const payoutRequestRef = doc(collection(db, 'payoutRequests'));
        transaction.set(payoutRequestRef, {
          userId: user.uid,
          amount: requestedPayoutAmount, // Use the validated requested amount
          status: 'pending',
          requestedAt: serverTimestamp(),
          processedAt: null,
          paymentMethod: payoutDetails.method,
          paymentDetails: payoutDetails,
          transactionIds: transactionIdsToUpdate,
          adminNotes: null,
          failureReason: null,
        });

        transaction.update(userDocRef, {
          cashbackBalance: currentBalance - requestedPayoutAmount, // Decrement by requested amount
          lastPayoutRequestAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          payoutDetails: payoutDetails,
        });

        transactionIdsToUpdate.forEach(txId => {
          const txRef = doc(db, 'transactions', txId);
          transaction.update(txRef, { payoutId: payoutRequestRef.id, updatedAt: serverTimestamp() });
        });
      });

      toast({
        title: "Payout Request Submitted",
        description: `Your request for ₹${requestedPayoutAmount.toFixed(2)} is being processed.`,
      });
      reset(); // Reset form
      const updatedProfile = await fetchUserProfile(user.uid); // Refetch to update UI
      if (updatedProfile) {
         const newBalance = updatedProfile.cashbackBalance || 0;
         setAvailableBalance(parseFloat(newBalance.toFixed(2)));
      } else {
         setAvailableBalance(0);
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
  
  const canRequestPayout = availableBalance >= MIN_PAYOUT_AMOUNT;

  return (
    <ProtectedRoute>
      <div className="space-y-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Send className="w-7 h-7 text-primary" /> Request Payout
        </h1>

        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle>Your Available Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary flex items-center">
              <IndianRupee className="mr-1 h-7 w-7" /> {availableBalance.toFixed(2)}
            </p>
            <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside space-y-1">
              <li>Minimum payout amount: {formatCurrency(MIN_PAYOUT_AMOUNT)}.</li>
              <li>Payouts are typically processed within 3-5 business days.</li>
              <li>Ensure your payout details are correct to avoid delays.</li>
            </ul>
          </CardContent>
        </Card>

        {pageError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        {!canRequestPayout && !authLoading && !loadingProfile && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Minimum Payout Not Met</AlertTitle>
            <AlertDescription>
              You need at least {formatCurrency(MIN_PAYOUT_AMOUNT)} in available cashback to request a payout. Keep shopping to earn more!
            </AlertDescription>
          </Alert>
        )}

        {canRequestPayout && (
          <Card className="shadow-md border">
            <CardHeader>
              <CardTitle>Payout Details</CardTitle>
              <CardDescription>Select your preferred method and provide details.</CardDescription>
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
                    placeholder={`Min ₹${MIN_PAYOUT_AMOUNT}`}
                    disabled={isSubmitting}
                    className={errors.amount ? "border-destructive" : ""}
                  />
                  {errors.amount && <p className="text-sm text-destructive mt-1">{errors.amount.message}</p>}
                   <p className="text-xs text-muted-foreground mt-1">
                    Enter an amount between {formatCurrency(MIN_PAYOUT_AMOUNT)} and {formatCurrency(availableBalance)}.
                  </p>
                </div>

                <Controller
                  name="payoutMethod"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="grid grid-cols-1 md:grid-cols-3 gap-4"
                      aria-label="Payout Method"
                    >
                      {(['bank_transfer', 'paypal', 'gift_card'] as PayoutMethod[]).map((method) => (
                        <Label
                          key={method}
                          htmlFor={`payout-${method}`}
                          className={`flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                            field.value === method ? "border-primary ring-2 ring-primary" : ""
                          }`}
                        >
                          <RadioGroupItem value={method} id={`payout-${method}`} className="sr-only" />
                          <span className="font-semibold capitalize mb-1">{method.replace('_', ' ')}</span>
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
                {errors.payoutMethod && <p className="text-sm text-destructive">{errors.payoutMethod.message}</p>}

                <div>
                  <Label htmlFor="payoutDetail">
                    {watch('payoutMethod') === 'bank_transfer' && 'Bank Account / UPI ID'}
                    {watch('payoutMethod') === 'paypal' && 'PayPal Email Address'}
                    {watch('payoutMethod') === 'gift_card' && 'Preferred Gift Card & Email'}
                    {!watch('payoutMethod') && 'Payment Details'}
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

                <Button type="submit" disabled={isSubmitting || !canRequestPayout || !isFormValid || !isDirty} className="w-full">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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

    