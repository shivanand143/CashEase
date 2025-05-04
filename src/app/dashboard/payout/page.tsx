// src/app/dashboard/payout/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, writeBatch, doc, getDocs, query, where, updateDoc, Timestamp } from 'firebase/firestore'; // Added Timestamp
import { db } from '@/lib/firebase/config';
import type { PayoutRequest, Transaction, UserProfile } from '@/lib/types'; // Import UserProfile

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
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from "@/lib/utils"; // Ensure cn is imported

const MIN_PAYOUT_THRESHOLD = 2000; // Payout threshold in INR (matches dashboard)

const payoutSchema = z.object({
  paymentMethod: z.string().min(1, { message: 'Please select a payment method' }),
  paymentDetails: z.string().min(1, { message: 'Payment details are required' }), // Simple string for now, adjust as needed
  // The actual amount will be the user's full available balance
});

type PayoutFormValues = z.infer<typeof payoutSchema>;

export default function PayoutPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRequestPayout = userProfile && userProfile.cashbackBalance >= MIN_PAYOUT_THRESHOLD;
  const availableBalance = userProfile?.cashbackBalance ?? 0;

  const {
    register,
    handleSubmit,
    control, // For ShadCN Select
    formState: { errors },
     setValue, // To set paymentMethod value
     watch, // To watch paymentMethod value
  } = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutSchema),
     defaultValues: {
        paymentMethod: '',
        paymentDetails: '',
     },
  });

   const selectedPaymentMethod = watch('paymentMethod');


  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to request a payout');
    } else if (!authLoading && user && userProfile && !canRequestPayout) { // Added userProfile check
       // Redirect if they somehow land here without enough balance
       toast({
          variant: "destructive",
          title: "Insufficient Balance",
          description: `You need at least ₹${MIN_PAYOUT_THRESHOLD} available cashback to request a payout.`,
       });
       router.push('/dashboard');
    }
  }, [user, userProfile, authLoading, router, canRequestPayout, toast]);


 const onSubmit = async (data: PayoutFormValues) => {
     if (!user || !userProfile || !canRequestPayout) {
       setError("Cannot process payout request. Please check your balance and login status.");
       return;
     }

     setLoading(true);
     setError(null);
     const payoutAmount = userProfile.cashbackBalance; // Payout the full available balance
     console.log(`Starting payout request for User: ${user.uid}, Amount: ₹${payoutAmount.toFixed(2)}`);

     // Start Firestore batch write
     const batch = writeBatch(db);

     try {
       // 1. Find all 'confirmed' transactions for the user that haven't been paid out yet
       console.log(`Querying 'confirmed' transactions for user ${user.uid}...`);
       const transactionsCollection = collection(db, 'transactions');
        // Query for 'confirmed' status WHERE payoutId is null
       const q = query(
         transactionsCollection,
         where('userId', '==', user.uid),
         where('status', '==', 'confirmed'),
         where('payoutId', '==', null) // Ensure not already linked to a payout
       );
       const querySnapshot = await getDocs(q);
       console.log(`Found ${querySnapshot.size} 'confirmed' transactions with no payoutId.`);

       const transactionIdsToUpdate: string[] = [];
       let sumOfTransactions = 0;

       querySnapshot.forEach((docSnap) => {
           console.log(`Processing transaction doc ID: ${docSnap.id}, Data:`, docSnap.data()); // Log each transaction found
           const txData = docSnap.data();
           // Basic validation for cashbackAmount existence and type
            if (typeof txData.cashbackAmount !== 'number') {
               console.warn(`Transaction ${docSnap.id} has missing or invalid cashbackAmount. Skipping.`);
               return; // Skip this transaction
            }
           const tx = txData as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'transactionDate' | 'confirmationDate'> & {
              createdAt: Timestamp, updatedAt: Timestamp, transactionDate: Timestamp, confirmationDate?: Timestamp | null
           };
           transactionIdsToUpdate.push(docSnap.id);
           sumOfTransactions += tx.cashbackAmount; // <-- Summing up
           console.log(`  - Including Tx ID: ${docSnap.id}, Amount: ₹${tx.cashbackAmount.toFixed(2)}`);
       });


       console.log(`Total sum of queried 'confirmed' transactions with no payoutId: ₹${sumOfTransactions.toFixed(2)}`);
       console.log(`User profile available balance: ₹${payoutAmount.toFixed(2)}`);

        // Stricter validation: Ensure the sum exactly matches the available balance
        if (Math.abs(sumOfTransactions - payoutAmount) > 0.01) {
             // Log more details before throwing error
              console.error(`Mismatch: Sum of confirmed transactions (₹${sumOfTransactions.toFixed(2)}) does not match available balance (₹${payoutAmount.toFixed(2)}).`);
             throw new Error("Balance calculation error. There's a mismatch between your confirmed cashback and transaction history. Please contact support.");
        }

       // 2. Create the PayoutRequest document
       const payoutCollection = collection(db, 'payoutRequests');
       const newPayoutRequestRef = doc(payoutCollection); // Auto-generate ID

       const payoutData: Omit<PayoutRequest, 'id'> = {
         userId: user.uid,
         amount: payoutAmount,
         status: 'pending', // Initial status
         requestedAt: serverTimestamp(),
         paymentMethod: data.paymentMethod,
         paymentDetails: { detail: data.paymentDetails }, // Store details flexibly, adapt schema if needed
         transactionIds: transactionIdsToUpdate,
          adminNotes: null, // Ensure adminNotes is initially null
          processedAt: null // Ensure processedAt is initially null
       };
       batch.set(newPayoutRequestRef, payoutData);
       console.log(`Prepared PayoutRequest document: ${newPayoutRequestRef.id}`);


       // 3. Update the user's profile balance
       const userDocRef = doc(db, 'users', user.uid);
       batch.update(userDocRef, {
         cashbackBalance: 0, // Reset available balance
         // Note: We don't decrease lifetime earnings here
         updatedAt: serverTimestamp() // Update the profile timestamp
       });
       console.log(`Prepared user profile balance update (set to 0).`);

        // 4. Update the status of the included transactions to 'paid' and link them to the payout request
        transactionIdsToUpdate.forEach(txId => {
            const txDocRef = doc(db, 'transactions', txId);
            // Update status to 'paid' and link the payoutId
            batch.update(txDocRef, { status: 'paid', payoutId: newPayoutRequestRef.id });
        });
        console.log(`Prepared to mark ${transactionIdsToUpdate.length} transactions as 'paid' and link to PayoutRequest ${newPayoutRequestRef.id}.`);


       // 5. Commit the batch write
       console.log("Committing batch write...");
       await batch.commit();
       console.log("Batch commit successful.");

       toast({
         title: 'Payout Request Submitted',
         description: `Your request for ₹${payoutAmount.toFixed(2)} has been submitted for review.`,
       });
       router.push('/dashboard'); // Redirect back to dashboard

     } catch (err: any) {
       console.error("Payout request failed:", err);
       setError(err.message || "An unexpected error occurred while submitting your payout request.");
       toast({
         variant: "destructive",
         title: 'Payout Failed',
         description: err.message || "Could not submit payout request. Please try again.",
       });
     } finally {
       setLoading(false);
     }
 };

  if (authLoading || (!user && !authLoading)) {
      // Show loading skeleton or return null while auth is resolving or redirecting
      return <PayoutPageSkeleton />;
  }

   if (!canRequestPayout && userProfile) {
       // Should be handled by redirect, but show message just in case
       return (
           <Card>
               <CardHeader>
                   <CardTitle>Request Payout</CardTitle>
               </CardHeader>
               <CardContent>
                   <Alert variant="destructive">
                       <AlertCircle className="h-4 w-4" />
                       <AlertTitle>Insufficient Balance</AlertTitle>
                       <AlertDescription>
                           You need at least ₹{MIN_PAYOUT_THRESHOLD} available cashback to request a payout. Your current balance is ₹{availableBalance.toFixed(2)}.
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
          {/* Payment Method Selection */}
           <div className="space-y-2">
               <Label htmlFor="paymentMethod">Payment Method</Label>
                {/* Use ShadCN Select wrapped in Controller */}
                 <Select
                    onValueChange={(value) => setValue('paymentMethod', value)} // Update RHF state
                    defaultValue={selectedPaymentMethod}
                    disabled={loading}
                 >
                     <SelectTrigger id="paymentMethod" aria-invalid={errors.paymentMethod ? "true" : "false"}>
                         <SelectValue placeholder="Select a method" />
                     </SelectTrigger>
                     <SelectContent>
                         <SelectItem value="paypal">PayPal</SelectItem>
                         <SelectItem value="bank_transfer">Bank Transfer (India - UPI/NEFT)</SelectItem>
                          {/* Add more methods as needed */}
                         <SelectItem value="gift_card">Gift Card (e.g., Amazon)</SelectItem>
                     </SelectContent>
                 </Select>
                 {errors.paymentMethod && <p className="text-sm text-destructive mt-1">{errors.paymentMethod.message}</p>}
           </div>


          {/* Payment Details Input - Contextual based on selected method */}
          {selectedPaymentMethod && (
             <div className="space-y-2">
               <Label htmlFor="paymentDetails">
                  {selectedPaymentMethod === 'paypal' && 'PayPal Email Address'}
                  {selectedPaymentMethod === 'bank_transfer' && 'Bank Account Details (Account #, IFSC, Name / UPI ID)'}
                  {selectedPaymentMethod === 'gift_card' && 'Gift Card Preference (e.g., Amazon Email)'}
                  {!['paypal', 'bank_transfer', 'gift_card'].includes(selectedPaymentMethod) && 'Payment Details'}
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
                   disabled={loading}
                   aria-invalid={errors.paymentDetails ? "true" : "false"}
                   rows={3}
                 />
                 {errors.paymentDetails && <p className="text-sm text-destructive mt-1">{errors.paymentDetails.message}</p>}
                  {selectedPaymentMethod === 'bank_transfer' && (
                     <p className='text-xs text-muted-foreground'>Please double-check bank details for accuracy.</p>
                  )}
             </div>
           )}

          <Button type="submit" className="w-full" disabled={loading || !selectedPaymentMethod || !userProfile || !canRequestPayout}>
            {loading ? 'Submitting Request...' : <> <Send className="mr-2 h-4 w-4" /> Submit Payout Request (₹{availableBalance.toFixed(2)}) </>}
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
