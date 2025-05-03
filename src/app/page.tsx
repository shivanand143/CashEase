// src/app/page.tsx
"use client"; // Make page client component for state and effects

import * as React from 'react'; // Import React
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Tag, Store as StoreIcon, ShoppingBag, Search, Loader2, AlertCircle, IndianRupee, List, BookOpen, Percent } from 'lucide-react'; // Added List, BookOpen, Percent
import { Input } from '@/components/ui/input'; // Import Input
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert components
import ProductCard from '@/components/product-card'; // Import the ProductCard
import { useToast } from '@/hooks/use-toast'; // Import useToast for copying
import { useAuth } from '@/hooks/use-auth'; // Import useAuth for click tracking
import { logClick } from '@/lib/tracking'; // Import tracking function
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"; // Import Carousel

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

// Mock data for demonstration - Replace with fetched data
const featuredStores = [
  { id: '1', name: 'Amazon', logoUrl: 'https://picsum.photos/seed/amazon/100/50', cashbackRate: 'Up to 3%', dataAiHint: "amazon logo", affiliateLink: '#' },
  { id: '2', name: 'Flipkart', logoUrl: 'https://picsum.photos/seed/flipkart/100/50', cashbackRate: 'Up to 2%', dataAiHint: "flipkart logo", affiliateLink: '#' },
  { id: '3', name: 'Myntra', logoUrl: 'https://picsum.photos/seed/myntra/100/50', cashbackRate: '1.5% Cashback', dataAiHint: "myntra logo", affiliateLink: '#' },
  { id: '4', name: 'Ajio', logoUrl: 'https://picsum.photos/seed/ajio/100/50', cashbackRate: 'Up to 4%', dataAiHint: "ajio logo", affiliateLink: '#' },
  { id: '5', name: 'BigBasket', logoUrl: 'https://picsum.photos/seed/bigbasket/100/50', cashbackRate: 'Flat ₹50', dataAiHint: "bigbasket logo", affiliateLink: '#' },
  { id: '6', name: 'MakeMyTrip', logoUrl: 'https://picsum.photos/seed/makemytrip/100/50', cashbackRate: 'Up to ₹1000', dataAiHint: "makemytrip logo", affiliateLink: '#' },
];

const featuredCoupons = [
  { id: 'c1', storeId: '1', storeName: 'Amazon', description: '10% off Select Electronics', code: 'AMZ10', link: '#', logoUrl: 'https://picsum.photos/seed/amazon/60/40' },
  { id: 'c2', storeId: '4', storeName: 'Ajio', description: '₹500 off Orders over ₹2000', code: 'AJIODEAL500', link: '#', logoUrl: 'https://picsum.photos/seed/ajio/60/40' },
  { id: 'c3', storeId: '2', storeName: 'Flipkart', description: 'Free Shipping on ₹499+', code: null, link: '#', logoUrl: 'https://picsum.photos/seed/flipkart/60/40' },
   { id: 'c4', storeId: '3', storeName: 'Myntra', description: 'Extra 15% off on First Order', code: 'MYNTRA15', link: '#', logoUrl: 'https://picsum.photos/seed/myntra/60/40' },
];

// Mock Categories
const categories = [
    { name: 'Fashion', icon: '👗', slug: 'fashion', img: 'https://picsum.photos/seed/fashion/300/150' },
    { name: 'Electronics', icon: '💻', slug: 'electronics', img: 'https://picsum.photos/seed/electronics/300/150' },
    { name: 'Travel', icon: '✈️', slug: 'travel', img: 'https://picsum.photos/seed/travel/300/150' },
    { name: 'Grocery', icon: '🛒', slug: 'grocery', img: 'https://picsum.photos/seed/grocery/300/150' },
    { name: 'Beauty', icon: '💄', slug: 'beauty', img: 'https://picsum.photos/seed/beauty/300/150' },
    { name: 'Home', icon: '🏠', slug: 'home', img: 'https://picsum.photos/seed/home/300/150' },
];

// Mock Blog Posts
const blogPosts = [
    { id: 'b1', title: 'Top 5 Summer Fashion Trends to Follow', excerpt: 'Stay cool and stylish this summer with these must-have fashion trends...', img: 'https://picsum.photos/seed/blog1/400/250', link: '/blog/summer-trends' },
    { id: 'b2', title: 'Maximize Your Cashback: Pro Tips', excerpt: 'Learn the secrets to earning more cashback on your everyday shopping...', img: 'https://picsum.photos/seed/blog2/400/250', link: '/blog/cashback-tips' },
    { id: 'b3', title: 'Upcoming Festival Sales: What to Expect', excerpt: 'Get ready for the biggest sales of the season. Here’s a sneak peek...', img: 'https://picsum.photos/seed/blog3/400/250', link: '/blog/festival-sales' },
];


export default function Home() {
  const [amazonSearchTerm, setAmazonSearchTerm] = React.useState('electronics');
  const [amazonProducts, setAmazonProducts] = React.useState<AmazonProduct[]>([]);
  const [isLoadingAmazon, setIsLoadingAmazon] = React.useState(false);
  const [amazonError, setAmazonError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

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
        setAmazonProducts([]);
        return;
    }
    setIsLoadingAmazon(true);
    setAmazonError(null);
    try {
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
      setAmazonProducts([]);
    } finally {
      setIsLoadingAmazon(false);
    }
  }, []);

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
       const targetUrl = store.affiliateLink || '#'; // Fallback URL
       if (user) {
           try {
               await logClick(user.uid, store.id);
           } catch (clickError) {
               console.error("Error logging store click:", clickError);
           }
       }
       window.open(targetUrl, '_blank', 'noopener,noreferrer');
   };

   // Click handler for Featured Coupons
   const handleCouponClick = async (coupon: typeof featuredCoupons[0]) => {
     const targetUrl = coupon.link || '#'; // Fallback URL
     if (user) {
         try {
             await logClick(user.uid, coupon.storeId, coupon.id);
         } catch (clickError) {
             console.error("Error logging coupon click:", clickError);
         }
     }
      if (coupon.code) {
         copyToClipboard(coupon.code);
      }
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
   };

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Hero Section */}
      <section className="text-center py-12 md:py-20 lg:py-24 bg-gradient-to-br from-primary/10 via-background to-secondary/10 rounded-lg shadow-sm overflow-hidden relative">
         {/* Optional: Add subtle background elements */}
          <div className="absolute inset-0 bg-[url('/path/to/subtle/pattern.svg')] opacity-5"></div>
         <div className="container px-4 md:px-6 relative z-10">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-foreground">
              Shop Smarter, Earn <span className="text-primary">CashEase</span> Back!
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Get real cashback and find the best coupons for thousands of online stores in India. Join free today!
            </p>
            {/* Main Search Bar */}
             <div className="relative mb-8 max-w-2xl mx-auto">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-20" />
               <Input
                 type="search"
                 placeholder="Search Stores & Offers (e.g., Amazon, Flipkart, Mobiles...)"
                 className="pl-12 pr-4 py-3 w-full h-14 text-lg rounded-full shadow-md focus:ring-2 focus:ring-primary focus:border-primary"
                 // value={globalSearchTerm} // Need state for this
                 // onChange={(e) => setGlobalSearchTerm(e.target.value)}
                 aria-label="Search stores and offers"
               />
               {/* Add search button if needed */}
             </div>

            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <Button size="lg" asChild className="w-full sm:w-auto shadow-md hover:shadow-lg transition-shadow">
                <Link href="/signup">Join Free & Start Earning</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/stores">Browse All Stores</Link>
              </Button>
            </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="container px-4 md:px-6">
        <h2 className="text-3xl font-bold text-center mb-8">Browse by Category</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
           {categories.map((category) => (
              <Link key={category.slug} href={`/category/${category.slug}`} className="group block">
                  <Card className="text-center hover:shadow-xl transition-shadow duration-300 border border-border rounded-lg overflow-hidden aspect-square flex flex-col items-center justify-center p-4 bg-card hover:bg-muted/50">
                     <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">{category.icon}</span>
                     <p className="font-semibold text-sm group-hover:text-primary">{category.name}</p>
                  </Card>
              </Link>
           ))}
        </div>
      </section>

       {/* Featured Stores Carousel Section */}
       <section className="container px-4 md:px-6">
         <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
           <h2 className="text-3xl font-bold text-center sm:text-left">Top Cashback Stores</h2>
           <Button variant="link" asChild className="shrink-0">
             <Link href="/stores">View All Stores <ArrowRight className="ml-2 h-4 w-4" /></Link>
           </Button>
         </div>
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {featuredStores.map((store) => (
                <CarouselItem key={store.id} className="pl-4 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/6">
                  <Card className="group flex flex-col items-center justify-between text-center hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-border rounded-lg overflow-hidden h-full">
                     <CardContent className="p-4 flex flex-col items-center flex-grow w-full">
                       <Link href={`/stores/${store.id}`} className="block mb-3" title={`View details for ${store.name}`}>
                            <Image data-ai-hint={store.dataAiHint} src={store.logoUrl} alt={`${store.name} Logo`} width={120} height={60} className="object-contain h-[60px] transition-transform duration-300 group-hover:scale-105" />
                       </Link>
                       <p className="font-semibold text-sm">{store.name}</p>
                       <p className="text-sm text-primary font-medium mt-1 line-clamp-1">{store.cashbackRate}</p>
                     </CardContent>
                     <CardFooter className="p-2 w-full border-t mt-auto bg-muted/30">
                       <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-secondary hover:bg-secondary/10 hover:text-secondary font-semibold"
                          onClick={() => handleStoreClick(store)}
                          title={`Shop at ${store.name} and earn cashback`}
                        >
                           <Percent className="mr-1 h-4 w-4"/> Shop & Earn
                       </Button>
                     </CardFooter>
                  </Card>
                 </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="absolute left-[-1rem] top-1/2 -translate-y-1/2 hidden sm:flex"/>
            <CarouselNext className="absolute right-[-1rem] top-1/2 -translate-y-1/2 hidden sm:flex"/>
          </Carousel>
       </section>


      {/* Featured Coupons Section */}
      <section className="container px-4 md:px-6">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-3xl font-bold text-center sm:text-left">Today's Top Coupons</h2>
          <Button variant="link" asChild className="shrink-0">
            <Link href="/coupons">View All Coupons <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {featuredCoupons.map((coupon) => (
             <Card key={coupon.id} className="group flex flex-col hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-border rounded-lg overflow-hidden">
                <CardHeader className="pb-2 flex flex-row items-start gap-3">
                     <Link href={`/stores/${coupon.storeId}`} className="shrink-0 block p-1 border rounded-md hover:shadow-sm transition-shadow bg-background">
                        <Image
                          data-ai-hint={`${coupon.storeName} logo small coupon`}
                          src={coupon.logoUrl || `https://picsum.photos/seed/${coupon.storeId}/60/40`}
                          alt={`${coupon.storeName} Logo`}
                          width={50}
                          height={30}
                          className="object-contain h-[30px] w-[50px]"
                           onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/placeholder/50/30'; }}
                        />
                     </Link>
                     <div className="flex-grow">
                         <Link href={`/stores/${coupon.storeId}`}>
                             <CardTitle className="text-md hover:text-primary transition-colors line-clamp-1 mb-1">{coupon.storeName}</CardTitle>
                         </Link>
                         <CardDescription className="text-base text-foreground leading-snug line-clamp-2 h-[3em]"> {/* Fixed height */}
                            {coupon.description}
                         </CardDescription>
                     </div>
                </CardHeader>
               <CardFooter className="p-4 border-t mt-auto bg-muted/30">
                  {coupon.code ? (
                    <Button variant="outline" className="w-full justify-between border-dashed border-accent text-accent hover:bg-accent/10 hover:text-accent focus:ring-accent" onClick={() => handleCouponClick(coupon)}>
                      <span className="font-mono font-bold truncate">{coupon.code}</span>
                      <span className="flex items-center gap-1">
                         <Tag className="w-4 h-4"/> Code
                      </span>
                    </Button>
                  ) : (
                       <Button className="w-full bg-secondary hover:bg-secondary/90" onClick={() => handleCouponClick(coupon)}>
                         Get Deal
                       </Button>
                  )}
               </CardFooter>
             </Card>
          ))}
        </div>
      </section>

      {/* Amazon Product Feed Section */}
      <section className="container px-4 md:px-6">
          <h2 className="text-3xl font-bold mb-6 text-center md:text-left">Trending on Amazon</h2>
           {/* Search Bar for Amazon Products */}
           <div className="relative mb-6 max-w-xl mx-auto">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
             <Input
               type="search"
               placeholder="Search Amazon products..."
               className="pl-10 w-full shadow-sm focus:ring-primary focus:border-primary"
               value={amazonSearchTerm}
               onChange={handleSearchChange}
               aria-label="Search Amazon products"
             />
           </div>

           {/* Loading State */}
           {isLoadingAmazon && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {[...Array(10)].map((_, index) => (
                     <Card key={index} className="overflow-hidden">
                         <Skeleton className="aspect-square w-full bg-muted" />
                         <CardContent className="p-4 space-y-2">
                             <Skeleton className="h-4 w-3/4 bg-muted" />
                             <Skeleton className="h-4 w-1/2 bg-muted" />
                             <Skeleton className="h-6 w-1/3 bg-muted" />
                         </CardContent>
                         <CardFooter className="p-4 pt-0">
                             <Skeleton className="h-9 w-full bg-muted" />
                         </CardFooter>
                     </Card>
                 ))}
              </div>
           )}

           {/* Error State */}
           {amazonError && !isLoadingAmazon && (
             <Alert variant="destructive" className="my-4 max-w-xl mx-auto">
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
                     // No Results Found
                     <div className="text-center py-10 text-muted-foreground">
                       <ShoppingBag className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                       <p className="font-semibold">No products found matching "{amazonSearchTerm}".</p>
                       <p className="text-sm">Try searching for something else.</p>
                     </div>
                 )
            )}
      </section>

      {/* Blog Section Placeholder */}
      <section className="container px-4 md:px-6 bg-muted/50 py-12 rounded-lg">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h2 className="text-3xl font-bold text-center sm:text-left">From the Blog</h2>
          <Button variant="link" asChild className="shrink-0">
            <Link href="/blog">View All Posts <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {blogPosts.map((post) => (
               <Card key={post.id} className="group overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-border rounded-lg">
                  <Link href={post.link} className="block">
                      <Image data-ai-hint={`blog post ${post.title}`} src={post.img} alt={post.title} width={400} height={250} className="object-cover aspect-[16/9] w-full group-hover:scale-105 transition-transform duration-300" />
                  </Link>
                  <CardContent className="p-4">
                      <Link href={post.link}>
                         <CardTitle className="text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">{post.title}</CardTitle>
                      </Link>
                      <CardDescription className="text-sm line-clamp-3">{post.excerpt}</CardDescription>
                   </CardContent>
                   <CardFooter className="p-4 pt-0">
                       <Button variant="link" asChild className="p-0 h-auto text-primary">
                          <Link href={post.link}>Read More <ArrowRight className="ml-1 h-4 w-4" /></Link>
                       </Button>
                   </CardFooter>
               </Card>
            ))}
        </div>
      </section>

      {/* How it Works Section - Refined */}
      <section className="container px-4 md:px-6">
        <h2 className="text-3xl font-bold text-center mb-8">How CashEase Works</h2>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {[
             { step: 1, title: "Find Your Store", desc: "Browse thousands of stores or search for your favorite one.", img: "https://picsum.photos/seed/step1/400/250", hint: "online shopping store search" },
             { step: 2, title: "Shop as Usual", desc: "Click the link on CashEase and shop directly on the store's site.", img: "https://picsum.photos/seed/step2/400/250", hint: "person shopping online laptop" },
             { step: 3, title: "Earn Cashback", desc: "Your cashback tracks automatically and gets added to your CashEase account.", img: "https://picsum.photos/seed/step3/400/250", hint: "money cashback reward illustration" },
           ].map((item) => (
              <Card key={item.step} className="text-center hover:shadow-xl transition-shadow duration-300 border border-border rounded-lg overflow-hidden">
                <CardHeader className="pb-0">
                  <CardTitle className="flex flex-col items-center gap-2">
                     <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-2xl mb-2">{item.step}</span>
                     {item.title}
                   </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                   <Image data-ai-hint={item.hint} src={item.img} alt={item.title} width={400} height={250} className="rounded-md object-cover aspect-video mb-4" />
                   <CardDescription>{item.desc}</CardDescription>
                </CardContent>
              </Card>
           ))}
        </div>
      </section>

    </div>
  );
}