// src/app/page.tsx
"use client"; // Make page client component for state and effects

import * as React from 'react'; // Import React
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Tag, Store as StoreIcon, ShoppingBag, Search, Loader2, AlertCircle, IndianRupee } from 'lucide-react'; // Added IndianRupee
import { Input } from '@/components/ui/input'; // Import Input
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert components
import ProductCard from '@/components/product-card'; // Import the new ProductCard
import { useToast } from '@/hooks/use-toast'; // Import useToast for copying
import { useAuth } from '@/hooks/use-auth'; // Import useAuth for click tracking
import { logClick } from '@/lib/tracking'; // Import tracking function

// Interface for Amazon product structure (matching API response)
interface AmazonProduct {
  asin: string;
  title: string;
  imageUrl?: string;
  price?: string;
  rating?: number;
  reviewsCount?: number;
  detailPageURL: string;
}

// Mock data for demonstration - can be removed if API works
const featuredStores = [
  { id: '1', name: 'Amazon', logoUrl: 'https://picsum.photos/seed/amazon/100/50', cashbackRate: 'Up to 3%', dataAiHint: "amazon logo", affiliateLink: '#' }, // Added placeholder link
  { id: '2', name: 'Walmart', logoUrl: 'https://picsum.photos/seed/walmart/100/50', cashbackRate: 'Up to 2%', dataAiHint: "walmart logo", affiliateLink: '#' }, // Added placeholder link
  { id: '3', name: 'Target', logoUrl: 'https://picsum.photos/seed/target/100/50', cashbackRate: '1.5% Cashback', dataAiHint: "target logo", affiliateLink: '#' }, // Added placeholder link
  { id: '4', name: 'Best Buy', logoUrl: 'https://picsum.photos/seed/bestbuy/100/50', cashbackRate: 'Up to 4%', dataAiHint: "best buy logo", affiliateLink: '#' }, // Added placeholder link
];

const featuredCoupons = [
  { id: 'c1', storeId: '1', storeName: 'Amazon', description: '10% off Select Electronics', code: 'AMZ10', link: '#' }, // Use # or real example links
  { id: 'c2', storeId: '4', storeName: 'Best Buy', description: '₹200 off Orders over ₹1000', code: 'BBDEAL200', link: '#' }, // Updated to INR
  { id: 'c3', storeId: '2', storeName: 'Walmart', description: 'Free Shipping on ₹350+' }, // Removed link intentionally to test fallback, updated to INR
];

export default function Home() {
  const [amazonSearchTerm, setAmazonSearchTerm] = React.useState('electronics'); // Default search term
  const [amazonProducts, setAmazonProducts] = React.useState<AmazonProduct[]>([]);
  const [isLoadingAmazon, setIsLoadingAmazon] = React.useState(false);
  const [amazonError, setAmazonError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth(); // Get user for tracking

  // Debounce function
  const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: Parameters<F>) => {
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
      timeout = setTimeout(() => func(...args), waitFor);
    };

    return debounced;
  };


  // Fetch Amazon products function
  const fetchProducts = React.useCallback(async (keywords: string) => {
    if (!keywords.trim()) {
        setAmazonProducts([]); // Clear products if search is empty
        return;
    }
    setIsLoadingAmazon(true);
    setAmazonError(null);
    try {
      // Fetch from the new API route
      const response = await fetch(`/api/amazon-products?keywords=${encodeURIComponent(keywords)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: AmazonProduct[] = await response.json();
      setAmazonProducts(data);
    } catch (error) {
      console.error("Failed to fetch Amazon products:", error);
      setAmazonError(error instanceof Error ? error.message : 'Failed to load products.');
      setAmazonProducts([]); // Clear products on error
    } finally {
      setIsLoadingAmazon(false);
    }
  }, []); // Empty dependency array as fetchProducts itself doesn't depend on external state changes

  // Debounced version of fetchProducts
   // eslint-disable-next-line react-hooks/exhaustive-deps
   const debouncedFetchProducts = React.useCallback(debounce(fetchProducts, 500), [fetchProducts]);


  // Effect to fetch products when search term changes (debounced)
  React.useEffect(() => {
    debouncedFetchProducts(amazonSearchTerm);
  }, [amazonSearchTerm, debouncedFetchProducts]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAmazonSearchTerm(event.target.value);
  };

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        toast({
          title: "Copied!",
          description: "Coupon code copied to clipboard.",
        });
      }).catch(err => {
        console.error('Failed to copy: ', err);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not copy code.",
        });
      });
  };

   // Click handler for Featured Stores Button
   const handleStoreClick = async (store: typeof featuredStores[0]) => {
       if (user) {
           try {
               // Log the click before redirecting
               await logClick(user.uid, store.id);
               // Redirect to the affiliate link in a new tab
               window.open(store.affiliateLink, '_blank', 'noopener,noreferrer');
           } catch (clickError) {
               console.error("Error logging store click:", clickError);
               // Still attempt to redirect even if logging fails
               window.open(store.affiliateLink, '_blank', 'noopener,noreferrer');
           }
       } else {
           // If user is not logged in, just redirect
           window.open(store.affiliateLink, '_blank', 'noopener,noreferrer');
           // Optionally, prompt the user to log in first
       }
   };

   // Click handler for Featured Coupons
   const handleCouponClick = async (coupon: typeof featuredCoupons[0]) => {
     if (user) {
         try {
             // Log the click associated with the store and coupon
             await logClick(user.uid, coupon.storeId, coupon.id);
             if (coupon.code) {
                 copyToClipboard(coupon.code);
             }
              // Redirect using coupon link or fallback (which might be store link)
             window.open(coupon.link || '#', '_blank', 'noopener,noreferrer'); // Use coupon.link
         } catch (clickError) {
             console.error("Error logging coupon click:", clickError);
             if (coupon.code) {
                copyToClipboard(coupon.code);
             }
             window.open(coupon.link || '#', '_blank', 'noopener,noreferrer');
         }
     } else {
          // Non-logged-in user
         if (coupon.code) {
            copyToClipboard(coupon.code);
         }
         window.open(coupon.link || '#', '_blank', 'noopener,noreferrer');
     }
   };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-16 bg-gradient-to-r from-primary/10 via-background to-secondary/10 rounded-lg shadow-sm">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
          Shop Smarter, Earn <span className="text-primary">CashEase</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Get real cashback and find the best coupons for thousands of online stores. Join free today!
        </p>
        <div className="space-x-4">
          <Button size="lg" asChild>
            <Link href="/signup">Get Started for Free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/stores">Browse Stores</Link>
          </Button>
        </div>
      </section>

      {/* Amazon Product Feed Section */}
      <section>
          <h2 className="text-3xl font-bold mb-6">Shop Top Products on Amazon</h2>
           {/* Search Bar for Amazon Products */}
           <div className="relative mb-6 max-w-xl mx-auto">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
             <Input
               type="search"
               placeholder="Search Amazon products (e.g., headphones, kitchen gadgets)..."
               className="pl-10 w-full"
               value={amazonSearchTerm}
               onChange={handleSearchChange}
               aria-label="Search Amazon products"
             />
           </div>

           {/* Loading State */}
           {isLoadingAmazon && (
             <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Loading Amazon products...</p>
             </div>
           )}

           {/* Error State */}
           {amazonError && !isLoadingAmazon && (
             <Alert variant="destructive" className="my-4">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Error Loading Products</AlertTitle>
               <AlertDescription>{amazonError}</AlertDescription>
             </Alert>
           )}

            {/* Product Grid */}
            {!isLoadingAmazon && !amazonError && (
                amazonProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {amazonProducts.map((product) => (
                        <ProductCard key={product.asin} product={product} />
                      ))}
                    </div>
                ) : (
                     // No Results Found (and not loading/erroring)
                     <div className="text-center py-10 text-muted-foreground">
                       <ShoppingBag className="mx-auto h-12 w-12 mb-4" />
                       <p>No products found matching "{amazonSearchTerm}".</p>
                       <p>Try searching for something else.</p>
                     </div>
                 )
            )}
      </section>


      {/* How it Works Section */}
      <section>
        <h2 className="text-3xl font-bold text-center mb-8">How CashEase Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><span className="text-primary font-bold text-4xl">1</span> Find Your Store</CardTitle>
              <CardDescription>Browse thousands of stores or search for your favorite one.</CardDescription>
            </CardHeader>
            <CardContent>
              <Image data-ai-hint="online shopping store search" src="https://picsum.photos/seed/step1/400/200" alt="Find Store" width={400} height={200} className="rounded-md object-cover" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><span className="text-primary font-bold text-4xl">2</span> Shop as Usual</CardTitle>
              <CardDescription>Click the link on CashEase and shop directly on the store's site.</CardDescription>
            </CardHeader>
            <CardContent>
              <Image data-ai-hint="person shopping online laptop" src="https://picsum.photos/seed/step2/400/200" alt="Shop" width={400} height={200} className="rounded-md object-cover" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
               <CardTitle className="flex items-center gap-2"><span className="text-primary font-bold text-4xl">3</span> Earn Cashback</CardTitle>
              <CardDescription>Your cashback tracks automatically and gets added to your CashEase account.</CardDescription>
            </CardHeader>
             <CardContent>
               <Image data-ai-hint="money cashback reward illustration" src="https://picsum.photos/seed/step3/400/200" alt="Earn Cashback" width={400} height={200} className="rounded-md object-cover" />
             </CardContent>
          </Card>
        </div>
      </section>

      {/* Featured Stores Section */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Featured Cashback Stores</h2>
          <Button variant="link" asChild>
            <Link href="/stores">View All Stores <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {featuredStores.map((store) => (
            <Card key={store.id} className="flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
               <CardContent className="p-4 flex flex-col items-center">
                 {/* Wrap Link content in a single element if Link itself throws error */}
                 <Link href={`/stores/${store.id}`} className="contents" title={`View details for ${store.name}`}>
                      <Image data-ai-hint={store.dataAiHint} src={store.logoUrl} alt={`${store.name} Logo`} width={100} height={50} className="object-contain mb-2 h-[50px]" />
                      <p className="font-semibold">{store.name}</p>
                      <p className="text-sm text-primary font-medium">{store.cashbackRate}</p>
                 </Link>
               </CardContent>
               <CardFooter className="p-2 w-full">
                 <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleStoreClick(store)}
                    title={`Shop at ${store.name} and earn cashback`}
                  >
                    Shop & Earn
                 </Button>
               </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* Featured Coupons Section */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Top Coupons</h2>
          <Button variant="link" asChild>
            <Link href="/coupons">View All Coupons <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {featuredCoupons.map((coupon) => (
            <Card key={coupon.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Tag className="w-5 h-5 text-secondary"/> {coupon.storeName}</CardTitle>
                <CardDescription>{coupon.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                 {coupon.code ? (
                   <Button
                     variant="outline"
                     className="w-full justify-between border-dashed border-accent text-accent hover:bg-accent/10 hover:text-accent"
                     onClick={() => handleCouponClick(coupon)}
                   >
                    <span>{coupon.code}</span>
                    <span>Copy Code</span>
                   </Button>
                 ) : (
                      <Button
                         className="w-full bg-secondary hover:bg-secondary/90"
                         onClick={() => handleCouponClick(coupon)}>
                        Get Deal
                      </Button>
                 )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

