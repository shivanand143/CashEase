
// src/app/dashboard/payout/page.tsx
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

const MIN_PAYOUT_AMOUNT = 250; // Minimum payout amount

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
      <Skeleton className="h-9 w-1/3" />
      <Card><CardHeader><Skeleton className="h-6 w-1/2 mb-2" /></CardHeader><CardContent><Skeleton className="h-12 w-1/2" /></CardContent></Card>
      <Card><CardHeader><Skeleton className="h-6 w-1/2 mb-2" /></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" /></div>
          <div className="space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" /></div>
          <div className="space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-20 w-full" /></div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card><CardHeader><Skeleton className="h-6 w-1/3 mb-2" /></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-full" />
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
  const [canRequest, setCanRequest] = useState(false);

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

  const requestedPayoutAmount = watch("amount");

  const refreshUserProfile = useCallback(async () => {
    if (!user) return;
    setLoadingProfile(true);
    try {
      const profile = await fetchUserProfile(user.uid);
      if (profile) {
        const balance = parseFloat((profile.cashbackBalance || 0).toFixed(2));
        setAvailableBalance(balance);
        setValue('amount', Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT)), { shouldValidate: true });
        if (profile.payoutDetails) {
          setValue('payoutMethod', profile.payoutDetails.method);
          setValue('payoutDetail', profile.payoutDetails.detail);
        }
        setCanRequest(balance >= MIN_PAYOUT_AMOUNT);
      } else {
        setPageError("Could not load your profile data for payout.");
        setCanRequest(false);
      }
    } catch (e) {
      setPageError("Error loading profile data.");
      setCanRequest(false);
    } finally {
      setLoadingProfile(false);
    }
  }, [user, fetchUserProfile, setValue]);

  useEffect(() => {
    if (!authLoading && user) {
      refreshUserProfile();
    } else if (!authLoading && !user) {
      setLoadingProfile(false);
      setCanRequest(false);
      router.push('/login?message=Please login to request a payout.');
    }
  }, [authLoading, user, router, refreshUserProfile]);


  const onSubmit = async (data: PayoutFormValues) => {
    console.log("PAYOUT_PAGE: Payout submission started with form data:", data);
    if (!user || !db || firebaseInitializationError || !userProfile) {
      setPageError("User not authenticated or database not available.");
      toast({ variant: "destructive", title: "Error", description: "Could not process request. Please try again." });
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    const finalRequestedAmount = parseFloat(data.amount.toFixed(2));

    const payoutDetails: PayoutDetails = {
      method: data.payoutMethod as PayoutMethod,
      detail: data.payoutDetail,
    };

    try {
      await runTransaction(db, async (transaction) => {
        console.log("PAYOUT_PAGE: Starting Firestore transaction.");
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await transaction.get(userDocRef);

        if (!userDocSnap.exists()) {
          console.error("PAYOUT_PAGE: User profile not found within transaction. UID:", user.uid);
          throw new Error("User profile not found. Cannot process payout.");
        }
        const currentUserData = userDocSnap.data() as UserProfile;
        const currentFreshBalance = parseFloat((currentUserData.cashbackBalance || 0).toFixed(2));
        console.log(`PAYOUT_PAGE: Fresh balance from Firestore: ₹${currentFreshBalance.toFixed(2)}`);

        if (finalRequestedAmount > currentFreshBalance) {
          console.error(`PAYOUT_PAGE: Requested amount (₹${finalRequestedAmount.toFixed(2)}) exceeds fresh balance (₹${currentFreshBalance.toFixed(2)}).`);
          throw new Error(`Your available balance (₹${currentFreshBalance.toFixed(2)}) is less than the requested amount. Please try again or refresh.`);
        }
        if (finalRequestedAmount < MIN_PAYOUT_AMOUNT) {
          console.error(`PAYOUT_PAGE: Requested amount (₹${finalRequestedAmount.toFixed(2)}) is less than minimum (₹${MIN_PAYOUT_AMOUNT}).`);
          throw new Error(`Minimum payout amount is ${formatCurrency(MIN_PAYOUT_AMOUNT)}.`);
        }

        // Create PayoutRequest document
        const payoutRequestRef = doc(collection(db, 'payoutRequests'));
        const payoutRequestData = {
          userId: user.uid,
          amount: finalRequestedAmount,
          status: 'pending' as PayoutStatus,
          requestedAt: serverTimestamp(),
          processedAt: null,
          paymentMethod: payoutDetails.method,
          paymentDetails: payoutDetails,
          transactionIds: [], // Will be populated by admin when marking as 'paid'
          adminNotes: null,
          failureReason: null,
        };
        transaction.set(payoutRequestRef, payoutRequestData);
        console.log(`PAYOUT_PAGE: PayoutRequest document created (ID: ${payoutRequestRef.id}) for ₹${finalRequestedAmount.toFixed(2)}.`);

        // Update user's profile: decrement cashbackBalance, set lastPayoutRequestAt, save payoutDetails
        transaction.update(userDocRef, {
          cashbackBalance: increment(-finalRequestedAmount),
          lastPayoutRequestAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          payoutDetails: payoutDetails,
        });
        console.log(`PAYOUT_PAGE: User profile (UID: ${user.uid}) updated. cashbackBalance decremented by ₹${finalRequestedAmount.toFixed(2)}.`);
      });

      toast({
        title: "Payout Request Submitted",
        description: `Your request for ${formatCurrency(finalRequestedAmount)} is being processed.`,
      });
      
      reset({ amount: MIN_PAYOUT_AMOUNT, payoutDetail: data.payoutDetail, payoutMethod: data.payoutMethod });
      await refreshUserProfile(); 

      console.log(`PAYOUT_PAGE: Payout request successful. Final Payout Amount: ₹${finalRequestedAmount.toFixed(2)}`);

    } catch (err: any) {
      console.error("PAYOUT_PAGE: Payout request submission failed:", err);
      setPageError(err.message || "Failed to submit payout request. Please try again.");
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
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Send className="w-6 h-6 sm:w-7 sm:h-7 text-primary" /> Request Payout
        </h1>

        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl"><IndianRupee className="w-5 h-5 sm:w-6 sm:h-6 text-primary"/> Your Available Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl sm:text-4xl font-bold text-primary">
              {formatCurrency(availableBalance)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl"><ListChecks className="w-5 h-5 sm:w-6 sm:h-6 text-primary"/> Payout Rules & Information</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                <p><strong>Minimum Payout:</strong> You need at least {formatCurrency(MIN_PAYOUT_AMOUNT)} in confirmed cashback to request a payout.</p>
                <p><strong>Source:</strong> Payouts are made from your 'Available Cashback Balance'.</p>
                <p><strong>Processing Time:</strong> Requests are typically processed within 3-5 business days after admin approval.</p>
                <p><strong>Accuracy:</strong> Please ensure your payout details are correct to avoid delays.</p>
                <p><strong>Important:</strong> When your payout is marked as 'Paid' by an admin, specific confirmed transactions from your history will be linked to this payout request to reconcile the amount.</p>
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
              You need at least {formatCurrency(MIN_PAYOUT_AMOUNT)} in available cashback to request a payout. Your current available balance is {formatCurrency(availableBalance)}. Keep shopping to earn more!
            </AlertDescription>
          </Alert>
        )}

        {canRequest && (
          <Card className="shadow-md border">
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Payout Details</CardTitle>
              <CardDescription>Select your preferred method and provide details. Requested amount must be between {formatCurrency(MIN_PAYOUT_AMOUNT)} and {formatCurrency(availableBalance)}.</CardDescription>
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
                        className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4"
                        aria-label="Payout Method"
                      >
                        {(['bank_transfer', 'paypal', 'gift_card'] as PayoutMethod[]).map((method) => (
                          <Label
                            key={method}
                            htmlFor={`payout-settings-${method}`}
                            className={`flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 sm:p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                              field.value === method ? "border-primary ring-2 ring-primary" : ""
                            }`}
                          >
                            <RadioGroupItem value={method} id={`payout-settings-${method}`} className="sr-only" />
                            <span className="font-semibold capitalize mb-1 text-sm">{method.replace('_', ' ')}</span>
                            <span className="text-xs text-muted-foreground text-center">
                              {method === 'bank_transfer' && 'Bank/UPI'}
                              {method === 'paypal' && 'PayPal Email'}
                              {method === 'gift_card' && 'e.g., Amazon'}
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

                <Button type="submit" disabled={isSubmitting || !canRequest || !isFormValid || !isDirty} className="w-full text-base py-3">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                  Request Payout of {formatCurrency(requestedPayoutAmount || 0)}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  );
}
