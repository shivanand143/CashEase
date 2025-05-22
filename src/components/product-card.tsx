
"use client";

import type { Product, Store } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, ShoppingCart, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { trackClickClientSide, TrackClickClientSideData } from '@/lib/actions/tracking';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import * as React from 'react';

interface ProductCardProps {
  product: Product;
  storeContext?: Store; // Store data passed from parent if available
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

// Function to append click ID to a URL
const appendClickIdToUrl = (url: string, clickId: string): string => {
  try {
    const urlObj = new URL(url);
    // Common subid parameters used by affiliate networks
    urlObj.searchParams.set('subid', clickId); // Generic
    urlObj.searchParams.set('aff_sub', clickId); // Often used
    urlObj.searchParams.set('s1', clickId); // Another common one
    // Add other common ones if you know them, e.g., aff_sub2, t_id, etc.
    return urlObj.toString();
  } catch (e) {
    console.warn("Invalid URL for click tracking, returning original:", url, e);
    return url; // Return original URL if parsing fails
  }
};

export default function ProductCard({ product, storeContext }: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessingClick, setIsProcessingClick] = React.useState(false);

  if (!product) {
    // Handle case where product might be undefined, though ideally this shouldn't happen
    return (
      <Card className="overflow-hidden h-full flex flex-col group border shadow-sm">
        <Skeleton className="aspect-square w-full" />
        <CardContent className="p-3 flex flex-col flex-grow justify-between">
          <div>
            <Skeleton className="h-5 w-3/4 mb-1" />
            <Skeleton className="h-4 w-1/2 mb-1" />
          </div>
          <div className="mt-auto">
            <Skeleton className="h-6 w-1/3 mb-3" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const placeholderText = product.name ? product.name.substring(0, 15) : "Product";
  const imageUrl = isValidHttpUrl(product.imageUrl)
    ? product.imageUrl!
    : `https://placehold.co/300x300.png?text=${encodeURIComponent(placeholderText)}`;

  const productTitle = product.name || 'Product Title';
  const affiliateLink = product.affiliateLink || '#'; // Original affiliate link without clickId yet
  const priceDisplay = product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : 'Price not available');

  const handleShopNow = async () => {
    setIsProcessingClick(true);
    console.log("ProductCard: handleShopNow triggered for product:", product.id);

    if (authLoading) {
      toast({ title: "Please wait", description: "Checking authentication..."});
      setIsProcessingClick(false);
      return;
    }
    if (affiliateLink === '#') {
        toast({ title: "Link Error", description: "Product link is not available.", variant: "destructive" });
        setIsProcessingClick(false);
        return;
    }

    const clickId = uuidv4();
    const finalAffiliateLinkWithClickId = appendClickIdToUrl(affiliateLink, clickId);
    console.log("ProductCard: Generated Click ID:", clickId, "Final URL:", finalAffiliateLinkWithClickId);

    if (!user) {
        console.log("ProductCard: User not logged in. Storing redirect and navigating to login.");
        sessionStorage.setItem('loginRedirectUrl', finalAffiliateLinkWithClickId); // Store the final URL
        sessionStorage.setItem('loginRedirectSource', router.asPath);
        router.push(`/login?message=Please login to track cashback for this product.`);
        setIsProcessingClick(false);
        return;
    }

    const clickData: TrackClickClientSideData = {
        userId: user.uid,
        storeId: product.storeId,
        storeName: storeContext?.name || product.storeName || "Unknown Store",
        productId: product.id,
        productName: product.name,
        clickId: clickId, // The UUID generated
        affiliateLink: finalAffiliateLinkWithClickId, // The link that will be opened
        originalLink: affiliateLink, // The base affiliate link
    };

    console.log("ProductCard: Preparing to track click (client-side):", clickData);

    try {
        const trackResult = await trackClickClientSide(clickData);
        if (trackResult.success) {
            console.log(`ProductCard: Click tracked successfully (client-side) for Product ${product.id}, ClickID ${trackResult.clickId}`);
            // Toast for tracking is optional, redirect happens next
        } else {
            console.error("ProductCard: Failed to track product click (client-side util error):", trackResult.error);
            toast({title: "Tracking Issue", description: `Could not fully track click: ${trackResult.error}. Proceeding to store.`, variant: "destructive", duration: 7000})
        }
    } catch (e) {
        console.error("ProductCard: Error calling trackClickClientSide:", e);
        toast({title: "Tracking Error", description: "An unexpected error during click tracking. Proceeding to store.", variant: "destructive", duration: 7000})
    } finally {
      setIsProcessingClick(false);
    }

    console.log("ProductCard: Opening affiliate link in new tab:", finalAffiliateLinkWithClickId);
    window.open(finalAffiliateLinkWithClickId, '_blank', 'noopener,noreferrer');
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
            data-ai-hint={product.dataAiHint || "product image"}
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
            disabled={authLoading || isProcessingClick}
          >
            {isProcessingClick || authLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <ShoppingCart className="mr-1 h-3 w-3" />}
            Shop Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

    