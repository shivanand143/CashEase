// src/components/admin/transaction-processing.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, addDoc, updateDoc, serverTimestamp, collection, Timestamp, runTransaction, getDoc, where, query, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Transaction, Store, UserProfile, CashbackStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Search, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Import Card components

// Zod schema for transaction form validation
const transactionSchema = z.object({
  userId: z.string().min(1, { message: "User ID is required" }),
  userEmail: z.string().optional(), // For searching/display
  storeId: z.string().min(1, { message: "Store is required" }),
  clickId: z.string().optional().nullable(),
  saleAmount: z.coerce.number().min(0, { message: "Sale amount must be positive" }),
  cashbackAmount: z.coerce.number().min(0, { message: "Cashback amount must be positive" }),
  status: z.enum(['pending', 'confirmed', 'rejected', 'paid']),
  transactionDate: z.date({ required_error: "Transaction date is required" }),
  confirmationDate: z.date().optional().nullable(),
  adminNotes: z.string().optional().nullable(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

interface TransactionFormProps {
  stores: Store[]; // List of stores for the dropdown
  transaction?: Transaction | null; // Existing transaction data for editing
  onClose: () => void;
  onSuccess: () => void; // Callback after successful save
}

export default function TransactionForm({ stores, transaction, onClose, onSuccess }: TransactionFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!transaction;
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      userId: '',
      userEmail: '',
      storeId: '',
      clickId: '',
      saleAmount: 0,
      cashbackAmount: 0,
      status: 'pending',
      transactionDate: new Date(),
      confirmationDate: null,
      adminNotes: '',
    },
  });

  // Pre-fill form if editing
  useEffect(() => {
    if (isEditing && transaction) {
      reset({
        userId: transaction.userId,
        userEmail: '', // Need to fetch user email separately if needed for display
        storeId: transaction.storeId,
        clickId: transaction.clickId || '',
        saleAmount: transaction.saleAmount,
        cashbackAmount: transaction.cashbackAmount,
        status: transaction.status,
        transactionDate: transaction.transactionDate instanceof Timestamp ? transaction.transactionDate.toDate() : (transaction.transactionDate || new Date()),
        confirmationDate: transaction.confirmationDate instanceof Timestamp ? transaction.confirmationDate.toDate() : (transaction.confirmationDate || null),
        adminNotes: transaction.adminNotes || '',
      });
      // Fetch user details for display if editing
      fetchUserDetails(transaction.userId);
    } else {
       // Reset to defaults if adding
       reset({
         userId: '',
         userEmail: '',
         storeId: '',
         clickId: '',
         saleAmount: 0,
         cashbackAmount: 0,
         status: 'pending',
         transactionDate: new Date(),
         confirmationDate: null,
         adminNotes: '',
       });
       setFoundUser(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction, isEditing, reset]);

  const fetchUserDetails = async (userId: string) => {
      if (!userId) return;
      setIsSearchingUser(true);
      try {
         const userDocRef = doc(db, 'users', userId);
         const userDocSnap = await getDoc(userDocRef);
         if (userDocSnap.exists()) {
           setFoundUser({ uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile);
           setValue('userEmail', userDocSnap.data().email || ''); // Update form field if needed
         } else {
           setFoundUser(null);
           setError(`User with ID ${userId} not found.`);
         }
      } catch (err) {
          console.error("Error fetching user details:", err);
          setError("Failed to fetch user details.");
          setFoundUser(null);
      } finally {
          setIsSearchingUser(false);
      }
  };

  const searchUserByEmail = async () => {
      if (!userSearchTerm.trim()) return;
      setIsSearchingUser(true);
      setError(null);
      setFoundUser(null); // Clear previous found user
      setValue('userId', ''); // Clear userId field

      try {
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", userSearchTerm.trim()), limit(1));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
              const userDoc = querySnapshot.docs[0];
              const userData = { uid: userDoc.id, ...userDoc.data() } as UserProfile;
              setFoundUser(userData);
              setValue('userId', userData.uid); // Set the found user ID
              setValue('userEmail', userData.email || '');
          } else {
              setError(`No user found with email: ${userSearchTerm}`);
          }
      } catch (err) {
          console.error("Error searching user by email:", err);
          setError("Failed to search for user.");
      } finally {
          setIsSearchingUser(false);
      }
  };

  // Function to calculate cashback based on store rates
   const calculateCashback = (saleAmt: number, storeId: string): number => {
      const selectedStore = stores.find(s => s.id === storeId);
      if (!selectedStore) return 0;

      if (selectedStore.cashbackType === 'percentage') {
          return saleAmt * (selectedStore.cashbackRateValue / 100);
      } else if (selectedStore.cashbackType === 'fixed') {
          return selectedStore.cashbackRateValue;
      }
      return 0;
   };

   // Watch saleAmount and storeId to auto-calculate cashback
   const watchedSaleAmount = watch('saleAmount');
   const watchedStoreId = watch('storeId');

   useEffect(() => {
       if (watchedStoreId && watchedSaleAmount >= 0) {
           const calculatedCashback = calculateCashback(watchedSaleAmount, watchedStoreId);
           setValue('cashbackAmount', parseFloat(calculatedCashback.toFixed(2))); // Set calculated value, ensure 2 decimal places
       }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [watchedSaleAmount, watchedStoreId, setValue, stores]);


  const onSubmit = async (data: TransactionFormValues) => {
    setLoading(true);
    setError(null);
    console.log("Form submitted with data:", data); // Log form data

    if (!data.userId) {
        setError("User ID is missing. Please find the user first.");
        setLoading(false);
        return;
    }

    const originalStatus = isEditing && transaction ? transaction.status : null;
    const newStatus = data.status;
    const cashbackAmount = data.cashbackAmount;
    const originalCashbackAmount = isEditing && transaction ? transaction.cashbackAmount : 0;

    console.log("Transaction details:", {
        isEditing,
        originalStatus,
        newStatus,
        cashbackAmount,
        originalCashbackAmount,
        userId: data.userId,
    });

    try {
        await runTransaction(db, async (dbTransaction) => {
            const userDocRef = doc(db, 'users', data.userId);
            const userSnap = await dbTransaction.get(userDocRef);

            if (!userSnap.exists()) {
                throw new Error("User profile not found.");
            }

            const userProfile = userSnap.data() as UserProfile;
            console.log("Current user profile data:", userProfile);

            let pendingCashback = userProfile.pendingCashback || 0;
            let cashbackBalance = userProfile.cashbackBalance || 0;
            let lifetimeCashback = userProfile.lifetimeCashback || 0;

            console.log("Initial balances:", { pendingCashback, cashbackBalance, lifetimeCashback });

            // Adjust balances based on status changes and amount differences
            if (isEditing) {
                console.log("Editing transaction - adjusting balances");
                // Revert old status impact
                if (originalStatus === 'pending') pendingCashback -= originalCashbackAmount;
                else if (originalStatus === 'confirmed') cashbackBalance -= originalCashbackAmount;

                 // Also revert lifetime if it was previously confirmed/paid
                 if (['confirmed', 'paid'].includes(originalStatus || '')) {
                     lifetimeCashback -= originalCashbackAmount;
                 }

                console.log("Balances after reverting old status:", { pendingCashback, cashbackBalance, lifetimeCashback });

                 // Applying new status impact
                 if (newStatus === 'pending') pendingCashback += cashbackAmount;
                 else if (newStatus === 'confirmed') {
                     cashbackBalance += cashbackAmount;
                     lifetimeCashback += cashbackAmount; // Add to lifetime when confirmed
                 } else if (newStatus === 'paid') {
                     // Usually 'paid' status doesn't change balance directly here,
                     // it should be handled by payout logic.
                     // But if editing TO 'paid' from something else, ensure lifetime is updated if needed.
                     if (!['confirmed', 'paid'].includes(originalStatus || '')) {
                         lifetimeCashback += cashbackAmount;
                     }
                 }
                 // If status changed TO 'rejected' from confirmed/paid, balance was already subtracted.
                 // If changed TO 'rejected' from pending, pending was already subtracted.

            } else { // Adding new transaction
                 console.log("Adding new transaction - adjusting balances");
                 if (newStatus === 'pending') pendingCashback += cashbackAmount;
                 else if (newStatus === 'confirmed') {
                     cashbackBalance += cashbackAmount;
                     lifetimeCashback += cashbackAmount;
                 }
                 // 'rejected' or 'paid' status for a NEW transaction usually means no balance change initially.
            }

            // Ensure balances don't go negative
            pendingCashback = Math.max(0, pendingCashback);
            cashbackBalance = Math.max(0, cashbackBalance);
            lifetimeCashback = Math.max(0, lifetimeCashback); // Lifetime should generally not decrease unless correcting errors

            const updatedProfileData: Partial<UserProfile> = {
                pendingCashback,
                cashbackBalance,
                lifetimeCashback,
                updatedAt: serverTimestamp()
            };
            console.log("Calculated updated profile data:", updatedProfileData);

            // Prepare transaction data for Firestore
            const transactionData = {
                userId: data.userId,
                storeId: data.storeId,
                clickId: data.clickId || null,
                saleAmount: data.saleAmount,
                cashbackAmount: cashbackAmount,
                status: newStatus,
                transactionDate: Timestamp.fromDate(data.transactionDate),
                confirmationDate: data.confirmationDate ? Timestamp.fromDate(data.confirmationDate) : null,
                adminNotes: data.adminNotes || null,
                updatedAt: serverTimestamp(),
            };

            if (isEditing && transaction) {
                // Update existing transaction
                const transactionDocRef = doc(db, 'transactions', transaction.id);
                console.log("Updating existing transaction:", transaction.id, transactionData);
                console.log("Updating user profile with:", updatedProfileData);
                dbTransaction.update(transactionDocRef, transactionData);
                dbTransaction.update(userDocRef, updatedProfileData);
                toast({
                    title: "Transaction Updated",
                    description: `Transaction ID ${transaction.id} has been successfully updated.`,
                });
            } else {
                // Add new transaction
                 const newTransactionRef = doc(collection(db, 'transactions')); // Generate new doc ref
                console.log("Adding new transaction:", newTransactionRef.id, transactionData);
                console.log("Updating user profile with:", updatedProfileData);
                dbTransaction.set(newTransactionRef, {
                    ...transactionData,
                    createdAt: serverTimestamp(), // Add createdAt for new
                });
                dbTransaction.update(userDocRef, updatedProfileData);
                toast({
                    title: "Transaction Added",
                    description: `New transaction has been successfully added for user ${data.userId}.`,
                });
            }
        }); // End Firestore transaction

        console.log("Firestore transaction committed successfully.");
        onSuccess(); // Call success callback (refetch list, close form)

    } catch (err: any) {
        console.error("Error saving transaction:", err);
        const errorMessage = err.message || "An unexpected error occurred.";
        setError(errorMessage);
        toast({
            variant: "destructive",
            title: "Save Failed",
            description: errorMessage,
        });
    } finally {
        setLoading(false);
    }
};


  return (
     <Card>
        <CardHeader>
           <CardTitle>{isEditing ? 'Edit Transaction' : 'Add New Transaction'}</CardTitle>
           <CardDescription>
             {isEditing ? `Update details for transaction ID: ${transaction?.id}` : 'Manually add a transaction and update user balance.'}
           </CardDescription>
        </CardHeader>
        <CardContent>
             {error && (
                 <Alert variant="destructive" className="mb-4">
                     <AlertCircle className="h-4 w-4" />
                     <AlertTitle>Error</AlertTitle>
                     <AlertDescription>{error}</AlertDescription>
                 </Alert>
             )}

            {/* User Search */}
            {!isEditing && (
               <div className="mb-4 p-4 border rounded-md bg-muted/50">
                 <Label htmlFor="userSearch" className="font-semibold mb-2 block">Find User by Email</Label>
                 <div className="flex gap-2">
                   <Input
                     id="userSearch"
                     placeholder="Enter user email..."
                     value={userSearchTerm}
                     onChange={(e) => setUserSearchTerm(e.target.value)}
                     disabled={loading || isSearchingUser}
                   />
                   <Button onClick={searchUserByEmail} disabled={loading || isSearchingUser || !userSearchTerm.trim()} type="button">
                     {isSearchingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                   </Button>
                 </div>
                 {foundUser && (
                   <div className="mt-2 text-sm text-green-700">
                     Found: {foundUser.displayName} ({foundUser.email}) - ID: {foundUser.uid}
                   </div>
                 )}
               </div>
            )}
             {errors.userId && !isEditing && <p className="text-sm text-destructive mb-4">{errors.userId.message}</p>}


           <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
             {/* User ID (Hidden if searching, shown if editing) */}
              <input type="hidden" {...register('userId')} />
              {isEditing && (
                  <div className="space-y-1">
                     <Label>User</Label>
                     <p className="text-sm text-muted-foreground">
                       {foundUser ? `${foundUser.displayName} (${foundUser.email})` : `ID: ${watch('userId')}`}
                       {isSearchingUser && !foundUser && ' (Loading...)'}
                     </p>
                  </div>
              )}

             {/* Store Selection */}
              <div className="space-y-1">
                <Label htmlFor="storeId">Store *</Label>
                <Controller
                  control={control}
                  name="storeId"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value} disabled={loading || stores.length === 0}>
                      <SelectTrigger id="storeId" aria-invalid={errors.storeId ? "true" : "false"}>
                        <SelectValue placeholder="Select a store..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.storeId && <p className="text-sm text-destructive mt-1">{errors.storeId.message}</p>}
              </div>

              {/* Sale Amount */}
              <div className="space-y-1">
                 <Label htmlFor="saleAmount">Sale Amount (₹) *</Label>
                 <Input id="saleAmount" type="number" step="0.01" {...register('saleAmount')} placeholder="e.g., 1000.50" disabled={loading} aria-invalid={errors.saleAmount ? "true" : "false"} />
                 {errors.saleAmount && <p className="text-sm text-destructive mt-1">{errors.saleAmount.message}</p>}
              </div>

             {/* Cashback Amount (Readonly - Auto calculated) */}
             <div className="space-y-1">
                <Label htmlFor="cashbackAmount">Cashback Amount (₹) *</Label>
                <Input id="cashbackAmount" type="number" step="0.01" {...register('cashbackAmount')} placeholder="Auto-calculated" readOnly disabled={loading} aria-invalid={errors.cashbackAmount ? "true" : "false"} className="bg-muted/50" />
                 {errors.cashbackAmount && <p className="text-sm text-destructive mt-1">{errors.cashbackAmount.message}</p>}
             </div>

             {/* Transaction Date */}
             <div className="space-y-1">
                <Label htmlFor="transactionDate">Transaction Date *</Label>
                 <Controller
                   control={control}
                   name="transactionDate"
                   render={({ field }) => (
                     <Popover>
                       <PopoverTrigger asChild>
                         <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal",!field.value && "text-muted-foreground")} disabled={loading}>
                           <CalendarIcon className="mr-2 h-4 w-4" />
                           {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                         </Button>
                       </PopoverTrigger>
                       <PopoverContent className="w-auto p-0">
                         <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                       </PopoverContent>
                     </Popover>
                   )}
                 />
                 {errors.transactionDate && <p className="text-sm text-destructive mt-1">{errors.transactionDate.message}</p>}
             </div>

             {/* Status */}
              <div className="space-y-1">
                 <Label htmlFor="status">Status *</Label>
                 <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                       <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                          <SelectTrigger id="status">
                             <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectItem value="pending">Pending</SelectItem>
                             <SelectItem value="confirmed">Confirmed</SelectItem>
                             <SelectItem value="rejected">Rejected</SelectItem>
                             <SelectItem value="paid">Paid</SelectItem>
                          </SelectContent>
                       </Select>
                    )}
                 />
                 {errors.status && <p className="text-sm text-destructive mt-1">{errors.status.message}</p>}
              </div>


              {/* Optional Fields */}
               <div className="space-y-1">
                   <Label htmlFor="clickId">Click ID</Label>
                   <Input id="clickId" {...register('clickId')} placeholder="Optional tracking ID" disabled={loading} />
               </div>

              <div className="space-y-1">
                   <Label htmlFor="confirmationDate">Confirmation Date</Label>
                    <Controller
                       control={control}
                       name="confirmationDate"
                       render={({ field }) => (
                         <Popover>
                           <PopoverTrigger asChild>
                             <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal",!field.value && "text-muted-foreground")} disabled={loading}>
                               <CalendarIcon className="mr-2 h-4 w-4" />
                               {field.value ? format(field.value, "PPP") : <span>Pick a date (optional)</span>}
                             </Button>
                           </PopoverTrigger>
                           <PopoverContent className="w-auto p-0">
                              <Calendar mode="single" selected={field.value ?? undefined} onSelect={(date) => field.onChange(date || null)} initialFocus />
                           </PopoverContent>
                         </Popover>
                       )}
                     />
              </div>

               <div className="space-y-1">
                   <Label htmlFor="adminNotes">Admin Notes</Label>
                   <Textarea id="adminNotes" {...register('adminNotes')} placeholder="Reason for rejection, etc." disabled={loading} />
               </div>

               <DialogFooter className="pt-4">
                 <DialogClose asChild>
                   <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                 </DialogClose>
                 <Button type="submit" disabled={loading || (!isEditing && !foundUser)}>
                   {loading ? 'Saving...' : (isEditing ? 'Update Transaction' : 'Add Transaction')}
                 </Button>
               </DialogFooter>
           </form>
        </CardContent>
     </Card>
  );
}
