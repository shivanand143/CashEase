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
import type { UserProfile, PayoutDetails, PayoutMethod, Transaction, CashbackStatus } from '@/lib/types'; // Ensure Transaction is imported
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { AlertCircle, IndianRupee, Send, Loader2 } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Skeleton } from '@/components/ui/skeleton';


const MIN_PAYOUT_AMOUNT = 250; // Example minimum payout

const payoutSchema = z.object({
  payoutMethod: z.enum(['bank_transfer', 'paypal', 'gift_card'], {
    required_error: "Please select a payout method.",
  }),
  payoutDetail: z.string().min(5, { message: "Payout details must be at least 5 characters." })
    .max(200, { message: "Payout details are too long." }),
});

type PayoutFormValues = z.infer<typeof payoutSchema>;

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

      {/* Skeleton for the form card or alert message */}
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
  const [canRequest, setCanRequest] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutSchema),
    defaultValues: {
      payoutMethod: undefined, // No default selected
      payoutDetail: userProfile?.payoutDetails?.detail || '',
    },
  });

  useEffect(() => {
    if (userProfile) {
      const balance = userProfile.cashbackBalance || 0;
      setAvailableBalance(parseFloat(balance.toFixed(2)));
      setCanRequest(balance >= MIN_PAYOUT_AMOUNT);
      if (userProfile.payoutDetails) {
        reset({ payoutMethod: userProfile.payoutDetails.method, payoutDetail: userProfile.payoutDetails.detail });
      }
      setLoadingBalance(false);
    } else if (!authLoading) {
      setLoadingBalance(false); // Not loading if no profile and auth is done
    }
  }, [userProfile, authLoading, reset]);


  const onSubmit = async (data: PayoutFormValues) => {
    if (!user || !userProfile || !db || firebaseInitializationError) {
      setError("User not authenticated or database not available.");
      toast({ variant: "destructive", title: "Error", description: "Could not process request." });
      return;
    }

    if (!canRequest) {
      setError(`Minimum payout amount of ₹${MIN_PAYOUT_AMOUNT} not met.`);
      toast({ variant: "destructive", title: "Payout Error", description: `Minimum payout amount of ₹${MIN_PAYOUT_AMOUNT} not met.` });
      return;
    }
    let payoutAmount = availableBalance; // Use the current available balance for the request

    setIsSubmitting(true);
    setError(null);

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
        let userCashbackBalance = currentUserData.cashbackBalance || 0;

        if (userCashbackBalance < MIN_PAYOUT_AMOUNT) {
          throw new Error(`Your current balance (₹${userCashbackBalance.toFixed(2)}) is less than the minimum payout of ₹${MIN_PAYOUT_AMOUNT}.`);
        }
        // Use the entire available balance for this payout request for simplicity
        payoutAmount = parseFloat(userCashbackBalance.toFixed(2));


        // Fetch confirmed transactions that have not been paid out yet
        const transactionsCollection = collection(db, 'transactions');
        const confirmedUnpaidQuery = query(
            transactionsCollection,
            where('userId', '==', user.uid),
            where('status', '==', 'confirmed'),
            where('payoutId', '==', null) // Only get transactions not yet part of any payout
        );

        let confirmedTransactionsSnap;
        try {
           confirmedTransactionsSnap = await getDocs(confirmedUnpaidQuery); // Use getDocs directly
        } catch (getQueryError: any) {
            console.error("Error during getDocs(query) for transactions:", getQueryError);
            throw new Error("Failed to fetch confirmed transactions for payout verification.");
        }

        console.log(`Found ${confirmedTransactionsSnap.size} 'confirmed' and unpaid transactions.`);

        let sumOfTransactions = 0;
        const transactionIdsToUpdate: string[] = [];
        const fetchedTransactions: Transaction[] = [];

        confirmedTransactionsSnap.forEach(docSnap => {
          const txData = docSnap.data() as Transaction;
          if (txData.cashbackAmount && typeof txData.cashbackAmount === 'number') {
            sumOfTransactions += txData.cashbackAmount;
            transactionIdsToUpdate.push(docSnap.id);
            fetchedTransactions.push({ id: docSnap.id, ...txData });
          } else {
            console.warn(`Transaction ${docSnap.id} has missing or invalid cashbackAmount. Skipping.`);
          }
        });
        sumOfTransactions = parseFloat(sumOfTransactions.toFixed(2));
        console.log(`Calculated sum of confirmed, unpaid transactions: ₹${sumOfTransactions.toFixed(2)}`);


        // Strict validation against the balance read *inside* the transaction
        if (Math.abs(sumOfTransactions - userCashbackBalance) > 0.01) {
            console.error(`Mismatch inside transaction: Sum (₹${sumOfTransactions.toFixed(2)}) vs User Profile Balance (₹${userCashbackBalance.toFixed(2)})`);
            throw new Error("Balance calculation error. There's a mismatch between your confirmed cashback and transaction history. Please contact support.");
        }
        // The actual payout amount will be the sum of these transactions, which should match the userCashbackBalance
        const finalPayoutAmount = sumOfTransactions;

        // 1. Create Payout Request Document
        const payoutRequestRef = doc(collection(db, 'payoutRequests'));
        transaction.set(payoutRequestRef, {
          userId: user.uid,
          amount: finalPayoutAmount,
          status: 'pending',
          requestedAt: serverTimestamp(),
          processedAt: null,
          paymentMethod: payoutDetails.method,
          paymentDetails: payoutDetails,
          transactionIds: transactionIdsToUpdate,
          adminNotes: null,
          failureReason: null,
        });
        console.log(`Payout request document created with ID: ${payoutRequestRef.id} for amount ₹${finalPayoutAmount.toFixed(2)}`);

        // 2. Update User's cashbackBalance to 0 and set lastPayoutRequestAt
        transaction.update(userDocRef, {
          cashbackBalance: 0, // Reset balance as it's all requested
          lastPayoutRequestAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          payoutDetails: payoutDetails, // Optionally save last used payout details
        });
        console.log(`User profile updated: cashbackBalance reset, lastPayoutRequestAt set.`);

        // 3. Mark transactions as 'Awaiting Payout' by linking them to this payoutId
        // This step is optional if you only filter by `payoutId == null` for new payouts.
        // If you want to explicitly mark them, you could add a status like 'awaiting_payout'.
        // For now, we just link them via payoutId.
        transactionIdsToUpdate.forEach(txId => {
          const txRef = doc(db, 'transactions', txId);
          transaction.update(txRef, { payoutId: payoutRequestRef.id, updatedAt: serverTimestamp() });
        });
        console.log(`Linked ${transactionIdsToUpdate.length} transactions to payout request ${payoutRequestRef.id}.`);

      });

      toast({
        title: "Payout Request Submitted",
        description: `Your request for ₹${payoutAmount.toFixed(2)} is being processed.`,
      });
      reset(); // Reset form
      // Refetch profile to update UI immediately
      const updatedProfile = await fetchUserProfile(user.uid);
      if (updatedProfile) {
        setAvailableBalance(updatedProfile.cashbackBalance || 0);
        setCanRequest((updatedProfile.cashbackBalance || 0) >= MIN_PAYOUT_AMOUNT);
      } else {
        setAvailableBalance(0);
        setCanRequest(false);
      }

    } catch (err: any) {
      console.error("Payout request failed:", err);
      setError(err.message || "Failed to submit payout request.");
      toast({ variant: "destructive", title: "Payout Failed", description: err.message || "Could not submit your request." });
    } finally {
      setIsSubmitting(false);
    }
  };


  if (authLoading || loadingBalance) {
    return <PayoutPageSkeleton />;
  }

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
            <p className="text-sm text-muted-foreground mt-1">
              Minimum payout amount: ₹{MIN_PAYOUT_AMOUNT.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!canRequest && !authLoading && !loadingBalance && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Minimum Payout Not Met</AlertTitle>
            <AlertDescription>
              You need at least ₹{MIN_PAYOUT_AMOUNT.toFixed(2)} in available cashback to request a payout. Keep shopping to earn more!
            </AlertDescription>
          </Alert>
        )}

        {canRequest && (
          <Card className="shadow-md border">
            <CardHeader>
              <CardTitle>Payout Details</CardTitle>
              <CardDescription>Select your preferred method and provide details.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Controller
                  name="payoutMethod"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
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
                          <span className="text-xs text-muted-foreground">
                            {method === 'bank_transfer' && 'Direct to Bank/UPI'}
                            {method === 'paypal' && 'To PayPal Account'}
                            {method === 'gift_card' && 'Amazon/Flipkart Card'}
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                  )}
                />
                {errors.payoutMethod && <p className="text-sm text-destructive">{errors.payoutMethod.message}</p>}

                <div>
                  <Label htmlFor="payoutDetail">
                    {control._formValues.payoutMethod === 'bank_transfer' && 'Bank Account / UPI ID'}
                    {control._formValues.payoutMethod === 'paypal' && 'PayPal Email Address'}
                    {control._formValues.payoutMethod === 'gift_card' && 'Preferred Gift Card (e.g., Amazon, Flipkart)'}
                    {!control._formValues.payoutMethod && 'Payment Details'}
                  </Label>
                  <Textarea
                    id="payoutDetail"
                    {...register('payoutDetail')}
                    placeholder={
                      control._formValues.payoutMethod === 'bank_transfer' ? 'e.g., Account No, IFSC, Name or UPI ID' :
                      control._formValues.payoutMethod === 'paypal' ? 'your.email@example.com' :
                      control._formValues.payoutMethod === 'gift_card' ? 'e.g., Amazon ₹500' :
                      'Enter relevant details here...'
                    }
                    rows={3}
                    disabled={isSubmitting}
                  />
                  {errors.payoutDetail && <p className="text-sm text-destructive">{errors.payoutDetail.message}</p>}
                </div>

                <Button type="submit" disabled={isSubmitting || !canRequest} className="w-full">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Request Payout of ₹{availableBalance.toFixed(2)}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  );
}
