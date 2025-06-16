
// src/app/dashboard/payout/page.tsx
"use client";

import * as React from 'react';
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
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
  FieldValue
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { UserProfile, PayoutDetails, PayoutMethod, Transaction, CashbackStatus, PayoutRequest, PayoutStatus as AppPayoutStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { AlertCircle, IndianRupee, Send, Loader2, Info, ListChecks, ShieldCheck } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Skeleton } from '@/components/ui/skeleton';

const MIN_PAYOUT_AMOUNT = 250; // Define your minimum payout amount
const PAYOUT_PAGE_LOG_PREFIX = "PAYOUT_PAGE:";

const payoutFormSchema = z.object({
  requestedAmount: z.number({
    required_error: "Amount is required.",
    invalid_type_error: "Amount must be a number.",
  }).positive({ message: "Amount must be positive." })
    .min(MIN_PAYOUT_AMOUNT, { message: `Minimum payout amount is ${formatCurrency(MIN_PAYOUT_AMOUNT)}.` }),
  payoutMethod: z.enum(['bank_transfer', 'paypal', 'gift_card'] as [PayoutMethod, ...PayoutMethod[]], {
    required_error: "Please select a payout method.",
  }),
  payoutDetail: z.string().min(5, { message: "Payout details must be at least 5 characters." })
    .max(200, { message: "Payout details are too long." }),
});

type PayoutFormValues = z.infer<typeof payoutFormSchema>;

function PayoutPageSkeleton() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <Skeleton className="h-9 w-1/3" />
      <Card><CardHeader><Skeleton className="h-6 w-1/2 mb-2" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-12 w-1/2" /></CardContent></Card>
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

  const [availableBalance, setAvailableBalance] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [pageLoading, setLoadingPage] = React.useState(true);
  const [canRequest, setCanRequest] = React.useState(false);

  

  // Dynamic schema based on availableBalance
  const payoutSchemaWithBalanceValidation = payoutFormSchema.refine(
    (data) => data.requestedAmount <= availableBalance,
    {
      message: "Requested amount cannot exceed your available balance.",
      path: ["requestedAmount"],
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
    resolver: zodResolver(payoutSchemaWithBalanceValidation),
    mode: "onChange", // Validate on change for better UX
    defaultValues: {
      requestedAmount: MIN_PAYOUT_AMOUNT,
      payoutMethod: undefined,
      payoutDetail: '',
    },
  });

  const requestedPayoutAmountFormValue = watch("requestedAmount");

  const refreshUserProfileAndSetState = React.useCallback(async () => {
    if (!user) {
      setLoadingPage(false);
      return;
    }
    setLoadingPage(true);
    setPageError(null);
    try {
      const profile = await fetchUserProfile(user.uid);
      if (profile) {
        const balance = parseFloat((profile.cashbackBalance || 0).toFixed(2));
        setAvailableBalance(balance);
        const canActuallyRequest = balance >= MIN_PAYOUT_AMOUNT;
        setCanRequest(canActuallyRequest);
        
        setValue('requestedAmount', Math.max(MIN_PAYOUT_AMOUNT, Math.min(balance, MIN_PAYOUT_AMOUNT)), { shouldValidate: true });
        if (profile.payoutDetails) {
          setValue('payoutMethod', profile.payoutDetails.method);
          setValue('payoutDetail', profile.payoutDetails.detail);
        } else {
          setValue('payoutMethod', 'bank_transfer');
          setValue('payoutDetail', '');
        }
      } else {
        setPageError("Could not load your profile data for payout.");
        setCanRequest(false);
      }
    } catch (e: any) {
      setPageError(`Error loading profile data: ${e.message || String(e)}`);
      setCanRequest(false);
    } finally {
      setLoadingPage(false);
    }
  }, [user, fetchUserProfile, setValue]);

  React.useEffect(() => {
    let isMounted = true;
    if (authLoading) return;

    if (!user) {
      if (isMounted) setLoadingPage(false);
      router.push('/login?message=Please login to request a payout.');
    } else {
      refreshUserProfileAndSetState();
    }
    return () => { isMounted = false; };
  }, [authLoading, user, router, refreshUserProfileAndSetState]);

  const onSubmit = async (data: PayoutFormValues) => {
    console.log(`${PAYOUT_PAGE_LOG_PREFIX} Payout form submitted with data:`, data);
    if (!user || !db || firebaseInitializationError) {
      const errMsg = "User not authenticated or database not available for payout.";
      console.error(`${PAYOUT_PAGE_LOG_PREFIX} ${errMsg}`, { user, db, firebaseInitializationError });
      setPageError(errMsg);
      toast({ variant: "destructive", title: "Error", description: "Could not process request. Please try again." });
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    const finalRequestedAmount = parseFloat(data.requestedAmount.toFixed(2));

    const payoutDetails: PayoutDetails = {
      method: data.payoutMethod,
      detail: data.payoutDetail,
    };

    try {
      console.log(`${PAYOUT_PAGE_LOG_PREFIX} Fetching confirmed, unpaid transactions for user ${user.uid}...`);
      const transactionsCollection = collection(db, 'transactions');
      const confirmedUnpaidQuery = query(
          transactionsCollection,
          where('userId', '==', user.uid),
          where('status', '==', 'confirmed' as CashbackStatus),
          where('payoutId', '==', null),
          orderBy('transactionDate', 'asc') // Process older transactions first
      );
      const confirmedTransactionsSnap = await getDocs(confirmedUnpaidQuery);
      console.log(`${PAYOUT_PAGE_LOG_PREFIX} Found ${confirmedTransactionsSnap.size} 'confirmed' and unpaid transactions.`);

      let sumOfSelectedTransactions = 0;
      const transactionIdsToIncludeInPayout: string[] = [];
      const selectedTransactionDetails: {id: string, amount: number}[] = [];

      for (const docSnap of confirmedTransactionsSnap.docs) {
          const txData = docSnap.data() as Transaction;
          const cashbackToConsider = txData.finalCashbackAmount ?? txData.initialCashbackAmount ?? 0;

          if (cashbackToConsider > 0 && (sumOfSelectedTransactions + cashbackToConsider) <= finalRequestedAmount) {
              sumOfSelectedTransactions += cashbackToConsider;
              transactionIdsToIncludeInPayout.push(docSnap.id);
              selectedTransactionDetails.push({ id: docSnap.id, amount: cashbackToConsider });
              console.log(`${PAYOUT_PAGE_LOG_PREFIX} Including Tx ID: ${docSnap.id}, Amount: ₹${cashbackToConsider.toFixed(2)}. Current sum: ₹${sumOfSelectedTransactions.toFixed(2)}`);
          }
          // Stop if we have enough or just slightly more (though loop condition prevents > finalRequestedAmount)
          if (sumOfSelectedTransactions >= finalRequestedAmount) break;
      }
      sumOfSelectedTransactions = parseFloat(sumOfSelectedTransactions.toFixed(2));
      console.log(`${PAYOUT_PAGE_LOG_PREFIX} Final sum of selected transactions: ₹${sumOfSelectedTransactions.toFixed(2)} for requested amount ₹${finalRequestedAmount.toFixed(2)}`);
      console.log(`${PAYOUT_PAGE_LOG_PREFIX} Selected transaction details:`, selectedTransactionDetails);

      const actualPayoutAmount = sumOfSelectedTransactions;

      if (actualPayoutAmount < MIN_PAYOUT_AMOUNT) {
          const specificError = selectedTransactionDetails.length === 0
            ? `No confirmed transactions found to fulfill any payout request.`
            : `Could not gather enough confirmed transaction value (found ${formatCurrency(actualPayoutAmount)}) to meet the minimum payout of ${formatCurrency(MIN_PAYOUT_AMOUNT)}. You requested ${formatCurrency(finalRequestedAmount)}.`;
          console.error(`${PAYOUT_PAGE_LOG_PREFIX} ${specificError}`);
          throw new Error(specificError);
      }
      if (actualPayoutAmount <= 0 && finalRequestedAmount > 0) {
          const zeroError = `Could not find any confirmed transactions with a positive cashback amount to fulfill your request of ${formatCurrency(finalRequestedAmount)}.`;
          console.error(`${PAYOUT_PAGE_LOG_PREFIX} ${zeroError}`);
          throw new Error(zeroError);
      }

      console.log(`${PAYOUT_PAGE_LOG_PREFIX} Proceeding with Firestore transaction for actual payout amount: ₹${actualPayoutAmount.toFixed(2)}`);
      await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db!, 'users', user.uid);
        const userDocSnap = await transaction.get(userDocRef);
        console.log(`${PAYOUT_PAGE_LOG_PREFIX} User document snapshot fetched inside transaction.`);

        if (!userDocSnap.exists()) {
          console.error(`${PAYOUT_PAGE_LOG_PREFIX} User profile ${user.uid} not found inside transaction.`);
          throw new Error("User profile not found. Cannot process payout.");
        }
        const currentUserData = userDocSnap.data() as UserProfile;
        const currentFreshBalance = parseFloat((currentUserData.cashbackBalance || 0).toFixed(2));
        console.log(`${PAYOUT_PAGE_LOG_PREFIX} Fresh balance inside transaction: ₹${currentFreshBalance.toFixed(2)}`);

        if (actualPayoutAmount > currentFreshBalance) {
          console.error(`${PAYOUT_PAGE_LOG_PREFIX} Mismatch inside transaction: Actual Payout (₹${actualPayoutAmount.toFixed(2)}) vs Fresh Balance (₹${currentFreshBalance.toFixed(2)})`);
          throw new Error(`Your available balance (now ₹${currentFreshBalance.toFixed(2)}) is less than the amount being processed for payout (₹${actualPayoutAmount.toFixed(2)}). Please refresh and try again.`);
        }
        
        const payoutRequestRef = doc(collection(db!, 'payoutRequests'));
        const payoutRequestData: Omit<PayoutRequest, 'id'> = {
          userId: user.uid,
          amount: actualPayoutAmount,
          requestedAmount: finalRequestedAmount,
          status: 'pending' as AppPayoutStatus,
          requestedAt: serverTimestamp() as Timestamp,
          processedAt: null,
          paymentMethod: payoutDetails.method,
          paymentDetails: payoutDetails,
          transactionIds: transactionIdsToIncludeInPayout,
          adminNotes: null,
          failureReason: null,
          updatedAt: serverTimestamp() as Timestamp,
        };
        transaction.set(payoutRequestRef, payoutRequestData);
        console.log(`${PAYOUT_PAGE_LOG_PREFIX} Payout request document prepared: ${payoutRequestRef.id}`);

        for (const txId of transactionIdsToIncludeInPayout) {
          const txRef = doc(db!, 'transactions', txId);
          transaction.update(txRef, {
            status: 'awaiting_payout' as CashbackStatus,
            payoutId: payoutRequestRef.id,
            updatedAt: serverTimestamp()
          });
        }
        console.log(`${PAYOUT_PAGE_LOG_PREFIX} ${transactionIdsToIncludeInPayout.length} transactions marked as 'awaiting_payout'.`);

        transaction.update(userDocRef, {
          cashbackBalance: increment(-actualPayoutAmount),
          lastPayoutRequestAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          payoutDetails: payoutDetails,
        });
        console.log(`${PAYOUT_PAGE_LOG_PREFIX} User profile update prepared. Balance debited by ₹${actualPayoutAmount.toFixed(2)}.`);
      });

      toast({
        title: "Payout Request Submitted",
        description: `Your request for ${formatCurrency(actualPayoutAmount)} (based on available transactions for your requested ${formatCurrency(finalRequestedAmount)}) is being processed.`,
      });
      
      reset({
          requestedAmount: MIN_PAYOUT_AMOUNT, 
          payoutDetail: data.payoutDetail, 
          payoutMethod: data.payoutMethod 
      }); 
      await refreshUserProfileAndSetState(); 

    } catch (err: any) {
      console.error(`${PAYOUT_PAGE_LOG_PREFIX} Payout request submission failed:`, err);
      setPageError(err.message || "Failed to submit payout request. Please try again.");
      toast({ variant: "destructive", title: "Payout Failed", description: err.message || "Could not submit your request." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || pageLoading) {
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
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl"><IndianRupee className="w-5 h-5 sm:w-6 sm:h-6 text-primary"/> Your Available Cashback Balance</CardTitle>
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
                <p><strong>Available Balance:</strong> Payouts are made from your 'Available Cashback Balance'.</p>
                <p><strong>Processing Time:</strong> Requests are typically processed within 3-7 business days after admin approval.</p>
                <p><strong>Correct Details:</strong> Ensure your payout details are accurate to avoid delays. Your selected details will be saved for future requests.</p>
                <p><strong>Transaction Matching:</strong> The system will attempt to match your requested amount with your available confirmed transactions. The actual payout amount might be the sum of these transactions, up to your requested amount.</p>
            </CardContent>
        </Card>

        {pageError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        {!canRequest && !authLoading && !pageLoading && (
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
              <CardTitle className="text-lg sm:text-xl">Enter Payout Details</CardTitle>
              <CardDescription>
                Enter the amount you wish to withdraw (between {formatCurrency(MIN_PAYOUT_AMOUNT)} and {formatCurrency(availableBalance)}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <Label htmlFor="requestedAmount">Amount to Withdraw (₹)*</Label>
                  <Input
                    id="requestedAmount"
                    type="number"
                    step="0.01"
                    {...register('requestedAmount', { valueAsNumber: true,
                      onChange: (e) => {
                        const val = e.target.value;
                        setValue('requestedAmount', val === '' ? 0 : parseFloat(val), {shouldValidate: true});
                      }
                    })}
                    placeholder={`Min ${formatCurrency(MIN_PAYOUT_AMOUNT)}`}
                    disabled={isSubmitting}
                    className={errors.requestedAmount ? "border-destructive" : ""}
                  />
                  {errors.requestedAmount && <p className="text-sm text-destructive mt-1">{errors.requestedAmount.message}</p>}
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
                            htmlFor={`payout-method-${method}`} // Changed ID for uniqueness
                            className={`flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 sm:p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                              field.value === method ? "border-primary ring-2 ring-primary" : ""
                            }`}
                          >
                            <RadioGroupItem value={method} id={`payout-method-${method}`} className="sr-only" />
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

                <Button type="submit" disabled={isSubmitting || !canRequest || !isFormValid || !isDirty || (requestedPayoutAmountFormValue || 0) > availableBalance} className="w-full text-base py-3">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                  Request Payout of {formatCurrency(requestedPayoutAmountFormValue || 0)}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  );
}

