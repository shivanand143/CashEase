
"use client";

import type { Product, Store } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, ShoppingCart, Loader2 } from 'lucide-react';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { trackClickClientSide } from '@/lib/actions/tracking'; // Updated import
import type { TrackClickData } from '@/lib/actions/tracking'; // Import TrackClickData type
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface ProductCardProps {
  product: Product;
  storeContext?: Store;
}

const isValidHttpUrl = (string: string | undefined | null): boolean => {
  if (!string) return false;
  let url;
  try {
    if (string.startsWith("Error:") || string.startsWith("Unhandled") || string.length > 2048) {
        return false;
    }
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

const appendClickIdToUrl = (url: string, clickId: string): string => {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('subid', clickId);
    urlObj.searchParams.set('aff_sub', clickId);
    return urlObj.toString();
  } catch (e) {
    console.warn("Invalid URL for click tracking, returning original:", url);
    return url;
  }
};


export function ProductCard({ product, storeContext }: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const placeholderText = product?.name ? product.name.substring(0,15) : "Product";
  const imageUrl = isValidHttpUrl(product?.imageUrl)
    ? product.imageUrl!
    : `https://placehold.co/300x300.png?text=${encodeURIComponent(placeholderText)}`;

  const productTitle = product?.name || 'Product Title';
  const affiliateLink = product?.affiliateLink || '#';
  const priceDisplay = product?.priceDisplay || (product?.price !== null && product?.price !== undefined ? formatCurrency(product.price) : 'Price not available');

  const handleShopNow = async () => {
    console.log("ProductCard: handleShopNow triggered for product:", product?.id);
    if (authLoading) {
      toast({ title: "Please wait", description: "Checking authentication..."});
      return;
    }
    if (!product || !affiliateLink || affiliateLink === '#') {
        toast({ title: "Link Error", description: "Product link is not available.", variant: "destructive" });
        return;
    }

    const clickId = uuidv4();
    const finalAffiliateLink = appendClickIdToUrl(affiliateLink, clickId);
    console.log("ProductCard: Generated Click ID:", clickId, "Final URL:", finalAffiliateLink);


    if (!user) {
        console.log("ProductCard: User not logged in. Storing redirect and navigating to login.");
        sessionStorage.setItem('loginRedirectUrl', finalAffiliateLink);
        sessionStorage.setItem('loginRedirectSource', router.asPath); // Save current path
        router.push('/login?message=Please login to track your cashback for this product.');
        return;
    }

    // Prepare data for client-side tracking
    const clickData: Omit<TrackClickData, 'timestamp' | 'userAgent'> = { // Omit fields handled by trackClickClientSide
        userId: user.uid,
        storeId: product.storeId,
        storeName: storeContext?.name || product.storeName || "Unknown Store",
        productId: product.id,
        productName: product.name,
        couponId: null,
        clickId: clickId,
        affiliateLink: finalAffiliateLink,
    };

    console.log("ProductCard: Preparing to track click with data (client-side):", clickData);

    try {
        // Call the client-side tracking function
        const trackResult = await trackClickClientSide(clickData);
        if (trackResult.success) {
            console.log(`ProductCard: Click tracked successfully (client-side) for Product ${product.id}, ClickID ${trackResult.clickId}`);
            toast({ title: "Tracking...", description: "Redirecting to store..." });
        } else {
            console.error("ProductCard: Failed to track product click (client-side util error):", trackResult.error);
            toast({title: "Tracking Issue", description: `Could not fully track click: ${trackResult.error}. Proceeding to store.`, variant: "destructive", duration: 7000})
        }
    } catch (e) {
        console.error("ProductCard: Error calling trackClickClientSide:", e);
        toast({title: "Tracking Error", description: "An unexpected error occurred during click tracking. Proceeding to store.", variant: "destructive", duration: 7000})
    }

    console.log("ProductCard: Opening affiliate link in new tab:", finalAffiliateLink);
    window.open(finalAffiliateLink, '_blank', 'noopener,noreferrer');
  };


  return (
    <Card className="overflow-hidden h-full flex flex-col group border shadow-sm hover:shadow-lg transition-shadow duration-300">
      <Link href={`/stores/${product.storeId}/products?highlight=${product.id}`} passHref legacyBehavior>
        <a className="block aspect-square relative overflow-hidden bg-muted">
            <Image
            src={imageUrl}
            alt={productTitle}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className="object-contain group-hover:scale-105 transition-transform duration-300 p-2"
            data-ai-hint={product?.dataAiHint || "product image"}
            onError={(e) => {
                (e.target as HTMLImageElement).src = `https://placehold.co/300x300.png?text=${encodeURIComponent(placeholderText)}`;
            }}
            />
        </a>
      </Link>
      <CardContent className="p-3 flex flex-col flex-grow justify-between">
        <div>
          <h3 className="text-sm font-medium leading-snug mb-1 h-10 line-clamp-2" title={productTitle}>
            <Link href={`/stores/${product.storeId}/products?highlight=${product.id}`} className="hover:text-primary transition-colors">
                {productTitle}
            </Link>
          </h3>
           {(storeContext?.name || product.storeName) && (
             <Link href={`/stores/${product.storeId}`} className="text-xs text-muted-foreground hover:text-primary transition-colors mb-1 block truncate">
               From: {storeContext?.name || product.storeName}
             </Link>
           )}
        </div>
        <div className="mt-auto">
          <p className="text-base font-semibold text-primary mb-3">
            {priceDisplay}
          </p>
          <Button
            size="sm"
            className="w-full text-xs bg-amber-500 hover:bg-amber-600 text-white"
            onClick={handleShopNow}
            disabled={authLoading}
          >
            {authLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <ShoppingCart className="mr-1 h-3 w-3" />}
            Shop Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
