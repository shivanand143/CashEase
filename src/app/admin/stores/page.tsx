// src/app/admin/stores/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, query, orderBy, deleteDoc, doc, addDoc, updateDoc, serverTimestamp, where, getCountFromServer, writeBatch, limit } from 'firebase/firestore'; // Added limit
import { db } from '@/lib/firebase/config';
import type { Store, CashbackType } from '@/lib/types'; // Import CashbackType
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, Store as StoreIcon, MoreHorizontal, PlusCircle, ExternalLink, Trash2, DatabaseZap } from 'lucide-react'; // Added DatabaseZap
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast";
import AdminGuard from '@/components/guards/admin-guard'; // Ensure page is protected
import StoreForm from '@/components/admin/store-form'; // Import the StoreForm component

// More detailed mock data for seeding
const initialStoresData = [
  { name: 'Amazon IN', logoUrl: 'https://picsum.photos/seed/amazonin/100/50', cashbackRate: 'Up to 5%', dataAiHint: "amazon india logo", affiliateLink: 'https://amazon.in?tag=cashease-21', description: 'Wide range of products from electronics to fashion.', categories: ['Electronics', 'Fashion', 'Home', 'Books', 'Grocery'], isFeatured: true },
  { name: 'Flipkart', logoUrl: 'https://picsum.photos/seed/flipkart/100/50', cashbackRate: 'Up to 4.5%', dataAiHint: "flipkart logo", affiliateLink: 'https://flipkart.com?affid=cashease', description: 'Leading Indian e-commerce platform for various goods.', categories: ['Electronics', 'Fashion', 'Home', 'Mobiles'], isFeatured: true },
  { name: 'Myntra', logoUrl: 'https://picsum.photos/seed/myntra/100/50', cashbackRate: 'Flat 6% Cashback', dataAiHint: "myntra logo", affiliateLink: 'https://myntra.com?ref=cashease', description: 'Your destination for fashion and lifestyle products.', categories: ['Fashion', 'Accessories', 'Beauty'], isFeatured: true },
  { name: 'Ajio', logoUrl: 'https://picsum.photos/seed/ajio/100/50', cashbackRate: 'Up to 8%', dataAiHint: "ajio logo", affiliateLink: 'https://ajio.com?cjevent=cashease', description: 'Curated collection of fashion brands.', categories: ['Fashion', 'Accessories'], isFeatured: false },
  { name: 'BigBasket', logoUrl: 'https://picsum.photos/seed/bigbasket/100/50', cashbackRate: 'Flat ₹75 on First Order', dataAiHint: "bigbasket logo", affiliateLink: 'https://bigbasket.com?bbref=cashease', description: 'Online grocery shopping and delivery.', categories: ['Grocery', 'Essentials'], isFeatured: false },
  { name: 'MakeMyTrip', logoUrl: 'https://picsum.photos/seed/makemytrip/100/50', cashbackRate: 'Up to ₹1500 on Flights', dataAiHint: "makemytrip logo", affiliateLink: 'https://makemytrip.com?partner=cashease', description: 'Book flights, hotels, and holiday packages.', categories: ['Travel', 'Flights', 'Hotels'], isFeatured: true },
  { name: 'Swiggy', logoUrl: 'https://picsum.photos/seed/swiggy/100/50', cashbackRate: 'Flat 20% off', dataAiHint: "swiggy logo", affiliateLink: 'https://swiggy.com?partner=cashease', description: 'Order food online from nearby restaurants.', categories: ['Food', 'Restaurant'], isFeatured: false },
  { name: 'PharmEasy', logoUrl: 'https://picsum.photos/seed/pharmeasy/100/50', cashbackRate: 'Flat 15% + 5% CB', dataAiHint: "pharmeasy logo", affiliateLink: 'https://pharmeasy.in?partner=cashease', description: 'Online pharmacy and healthcare products.', categories: ['Health', 'Pharmacy', 'Medicine'], isFeatured: false },
  { name: 'Nykaa', logoUrl: 'https://picsum.photos/seed/nykaa/100/50', cashbackRate: 'Up to 7%', dataAiHint: "nykaa logo", affiliateLink: 'https://nykaa.com?partner=cashease', description: 'Beauty, makeup, and wellness products.', categories: ['Beauty', 'Cosmetics', 'Skincare'], isFeatured: true },
  { name: 'BookMyShow', logoUrl: 'https://picsum.photos/seed/bookmyshow/100/50', cashbackRate: '₹100 off on Movies', dataAiHint: "bookmyshow logo", affiliateLink: 'https://bookmyshow.com?partner=cashease', description: 'Book movie tickets, events, and plays.', categories: ['Entertainment', 'Movies', 'Events'], isFeatured: false },
];


function parseCashback(rateString: string): { type: CashbackType, value: number } {
    let type: CashbackType = 'percentage'; // Default
    let value = 0;

    // Improved regex to handle various formats like "Up to ₹1500", "Flat ₹75", "Flat 20%", "Up to 5%"
    const fixedMatch = rateString.match(/(?:flat|up to)\s*₹\s*(\d+(\.\d+)?)/i);
    if (fixedMatch) {
      type = 'fixed';
      value = parseFloat(fixedMatch[1]);
      return { type, value };
    }

    const percentageMatch = rateString.match(/(\d+(\.\d+)?)%/);
    if (percentageMatch) {
        type = 'percentage';
        value = parseFloat(percentageMatch[1]);
        return { type, value };
    }

    // Handle cases like "Flat 20% off" - treat as percentage
    const flatPercentageMatch = rateString.match(/flat\s*(\d+(\.\d+)?)\s*%/i);
    if (flatPercentageMatch) {
       type = 'percentage';
       value = parseFloat(flatPercentageMatch[1]);
       return { type, value };
    }

    // Handle "CB" as Cashback (treat as percentage if no currency symbol)
    const cashbackSuffixMatch = rateString.match(/(\d+(\.\d+)?)\s*cb/i);
    if (cashbackSuffixMatch) {
        type = 'percentage'; // Assuming CB implies percentage unless ₹ specified elsewhere
        value = parseFloat(cashbackSuffixMatch[1]);
        return { type, value };
    }


    console.warn(`Could not parse cashback rate: "${rateString}". Using default 0%.`);
    return { type: 'percentage', value: 0 }; // Return default if parsing fails
}

// Use provided categories if available, otherwise infer
function getCategories(storeData: typeof initialStoresData[0]): string[] {
    return storeData.categories && storeData.categories.length > 0
        ? storeData.categories
        : inferCategories(storeData.name); // Fallback to inference
}


function inferCategories(storeName: string): string[] {
    const lowerName = storeName.toLowerCase();
    if (lowerName.includes('amazon') || lowerName.includes('flipkart')) return ['Electronics', 'Fashion', 'Home', 'Books'];
    if (lowerName.includes('myntra') || lowerName.includes('ajio')) return ['Fashion', 'Accessories'];
    if (lowerName.includes('bigbasket')) return ['Grocery', 'Essentials'];
    if (lowerName.includes('makemytrip')) return ['Travel', 'Flights', 'Hotels'];
    if (lowerName.includes('swiggy')) return ['Food', 'Restaurant'];
    if (lowerName.includes('pharmeasy')) return ['Health', 'Pharmacy'];
    if (lowerName.includes('nykaa')) return ['Beauty', 'Cosmetics'];
    if (lowerName.includes('bookmyshow')) return ['Entertainment', 'Movies'];
    // Add more category inference rules here
    return ['General']; // Default category
}

function AdminStoresPageContent() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false); // State for Add/Edit modal/drawer
  const [selectedStore, setSelectedStore] = useState<Store | null>(null); // State for editing
  const [isSeeding, setIsSeeding] = useState(false);
  const [storesExist, setStoresExist] = useState(true); // Assume stores exist initially

  const fetchStores = async () => {
      setLoading(true);
      setError(null);
      try {
        const storesCollection = collection(db, 'stores');
        // Check if stores exist first
        const countSnapshot = await getCountFromServer(query(storesCollection, limit(1)));
        const hasStores = countSnapshot.data().count > 0;
        setStoresExist(hasStores);

        if (hasStores) {
           // Order by name if stores exist
           const q = query(storesCollection, orderBy('name', 'asc'));
           const querySnapshot = await getDocs(q);
           const storesData = querySnapshot.docs.map(doc => ({
             id: doc.id,
             ...doc.data(),
             createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
             updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
           })) as Store[];
           setStores(storesData);
        } else {
           setStores([]); // No stores found
        }

      } catch (err) {
        console.error("Error fetching stores:", err);
        setError("Failed to load stores. Please try again later.");
        setStoresExist(true); // Reset assumption on error
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const handleSeedStores = async () => {
      setIsSeeding(true);
      setError(null);
      console.log("Seeding initial store data...");

      try {
          // Use a batch write for atomicity
          const batch = writeBatch(db);
          const storesCollection = collection(db, 'stores');

          initialStoresData.forEach(storeData => {
              const docRef = doc(storesCollection); // Auto-generate ID
              const { type, value } = parseCashback(storeData.cashbackRate);
              const categories = getCategories(storeData); // Use specific or inferred categories

              const newStore: Omit<Store, 'id' | 'createdAt' | 'updatedAt'> = {
                  name: storeData.name,
                  logoUrl: storeData.logoUrl,
                  affiliateLink: storeData.affiliateLink,
                  cashbackRate: storeData.cashbackRate,
                  cashbackRateValue: value,
                  cashbackType: type,
                  description: storeData.description || `${storeData.name} deals and offers.`, // Use provided or default description
                  categories: categories,
                  isActive: true,
                  isFeatured: storeData.isFeatured ?? false, // Use provided featured status or default to false
              };
              batch.set(docRef, {
                  ...newStore,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
              });
          });

          await batch.commit();
          toast({
              title: "Stores Seeded",
              description: `${initialStoresData.length} stores added to the database.`,
          });
          await fetchStores(); // Refresh the list after seeding
      } catch (err) {
          console.error("Error seeding stores:", err);
          setError("Failed to seed initial store data. Please check console.");
          toast({
              variant: "destructive",
              title: "Seeding Failed",
              description: "Could not add initial stores. See console for details.",
          });
      } finally {
          setIsSeeding(false);
      }
  };


  const handleEdit = (store: Store) => {
      console.log(`Edit action for store: ${store.name} (ID: ${store.id})`);
      setSelectedStore(store);
      setIsFormOpen(true);
  };

  const handleDelete = async (storeId: string, storeName: string) => {
      console.log(`Attempting to delete store: ${storeName} (ID: ${storeId})`);

       // Check for associated coupons before deleting
       try {
           const couponsCollection = collection(db, 'coupons');
           const q = query(couponsCollection, where('storeId', '==', storeId), limit(1)); // Just check if any exist
           const querySnapshot = await getDocs(q);


           if (!querySnapshot.empty) {
               toast({
                   variant: "destructive",
                   title: "Deletion Blocked",
                   description: `Cannot delete store "${storeName}" as it has associated coupons. Please delete or reassign the coupons first.`,
               });
               return; // Stop deletion process
           }

           // Proceed with deletion if no coupons found
           await deleteDoc(doc(db, 'stores', storeId));
           toast({
               title: "Store Deleted",
               description: `Store "${storeName}" has been successfully deleted.`,
           });
           fetchStores(); // Refresh stores list
       } catch (err) {
           console.error("Error deleting store or checking coupons:", err);
           toast({
               variant: "destructive",
               title: "Deletion Failed",
               description: `Could not delete store "${storeName}". Please try again. Error: ${err instanceof Error ? err.message : String(err)}`,
           });
           setError(`Failed to delete store ${storeName}.`);
       }
  };

  const handleAddNew = () => {
      console.log("Add new store action triggered");
      setSelectedStore(null); // Ensure no store is selected for editing
      setIsFormOpen(true);
  };

   const handleFormSuccess = () => {
      fetchStores();
      setIsFormOpen(false);
      setSelectedStore(null); // Clear selection after success
   };


  return (
     <AdminGuard> {/* Wrap content with guard */}
       <Card>
         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
               <CardTitle className="text-2xl flex items-center gap-2">
                 <StoreIcon className="w-6 h-6"/> Manage Stores
               </CardTitle>
               <CardDescription>Add, edit, or remove stores offering cashback.</CardDescription>
            </div>
             <div className="flex items-center gap-2">
                {!storesExist && !loading && (
                   <Button onClick={handleSeedStores} disabled={isSeeding} variant="secondary">
                      <DatabaseZap className="mr-2 h-4 w-4" /> {isSeeding ? 'Seeding...' : 'Seed Initial Stores'}
                   </Button>
                )}
                 <Button onClick={handleAddNew} disabled={isSeeding}>
                     <PlusCircle className="mr-2 h-4 w-4" /> Add New Store
                 </Button>
            </div>
         </CardHeader>
         <CardContent>
           {error && (
             <Alert variant="destructive" className="mb-4">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Error</AlertTitle>
               <AlertDescription>{error}</AlertDescription>
             </Alert>
           )}
           {loading ? (
             <StoresTableSkeleton />
           ) : stores.length > 0 ? (
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-[80px]">Logo</TableHead>
                   <TableHead>Name</TableHead>
                   <TableHead>Cashback Rate</TableHead>
                   <TableHead className="hidden md:table-cell">Categories</TableHead>
                    <TableHead className="hidden lg:table-cell">Affiliate Link</TableHead>
                   <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {stores.map((store) => (
                   <TableRow key={store.id}>
                      <TableCell>
                        <Image
                            data-ai-hint={`${store.name} logo admin small`}
                            src={store.logoUrl || `https://picsum.photos/seed/${store.id}/60/30`}
                            alt={`${store.name} Logo`}
                            width={60}
                            height={30}
                            className="object-contain rounded-sm border h-[30px] w-[60px]"
                            onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/60/30'; }}
                          />
                      </TableCell>
                     <TableCell className="font-medium">{store.name}</TableCell>
                     <TableCell className="text-primary font-semibold">{store.cashbackRate}</TableCell>
                     <TableCell className="hidden md:table-cell text-xs">{store.categories.join(', ')}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                         <a href={store.affiliateLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate flex items-center gap-1" title={store.affiliateLink}>
                             {store.affiliateLink.length > 40 ? store.affiliateLink.substring(0, 40) + '...' : store.affiliateLink}
                             <ExternalLink className="w-3 h-3 shrink-0"/>
                         </a>
                      </TableCell>
                      <TableCell className="text-center">
                         <Badge variant={store.isActive ? 'default' : 'outline'}>
                           {store.isActive ? 'Active' : 'Inactive'}
                         </Badge>
                      </TableCell>
                     <TableCell className="text-center">
                       <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                           <Button variant="ghost" className="h-8 w-8 p-0">
                             <span className="sr-only">Open menu</span>
                             <MoreHorizontal className="h-4 w-4" />
                           </Button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="end">
                           <DropdownMenuLabel>Actions</DropdownMenuLabel>
                           <DropdownMenuItem onClick={() => handleEdit(store)}>Edit Store</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(`/stores/${store.id}`, '_blank')}>View Public Page</DropdownMenuItem>
                           <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                  <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                     <Trash2 className="mr-2 h-4 w-4"/> Delete Store
                                  </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the store
                                    "{store.name}". Make sure no coupons are associated with this store first.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                      onClick={() => handleDelete(store.id, store.name)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Yes, delete store
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                         </DropdownMenuContent>
                       </DropdownMenu>
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           ) : (
             <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-4">
                 <p>No stores found in the database.</p>
                 <Button onClick={handleSeedStores} disabled={isSeeding}>
                     <DatabaseZap className="mr-2 h-4 w-4" /> {isSeeding ? 'Seeding...' : 'Seed Initial Stores'}
                 </Button>
             </div>
           )}
           {/* TODO: Add Pagination */}
         </CardContent>
         {/* Implement Add/Edit Form Modal/Drawer */}
          {isFormOpen && (
              <StoreForm
                  store={selectedStore}
                  onClose={() => setIsFormOpen(false)}
                  onSuccess={handleFormSuccess} // Use the success handler
              />
          )}
       </Card>
     </AdminGuard>
   );
}

export default AdminStoresPageContent;


function StoresTableSkeleton() {
    return (
       <Table>
         <TableHeader>
           <TableRow>
              <TableHead className="w-[80px]"><Skeleton className="h-5 w-16" /></TableHead>
              <TableHead><Skeleton className="h-5 w-32" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead className="hidden md:table-cell"><Skeleton className="h-5 w-40" /></TableHead>
              <TableHead className="hidden lg:table-cell"><Skeleton className="h-5 w-48" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableHead>
           </TableRow>
         </TableHeader>
         <TableBody>
           {[...Array(5)].map((_, i) => (
             <TableRow key={i}>
                <TableCell><Skeleton className="h-[30px] w-[60px] rounded-sm" /></TableCell>
                <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-56" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-8 w-8 rounded-full mx-auto" /></TableCell>
             </TableRow>
           ))}
         </TableBody>
       </Table>
    )
 }
