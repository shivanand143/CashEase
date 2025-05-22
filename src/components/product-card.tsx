
"use client";

import type { Product, Store, CashbackType } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, ShoppingCart, Loader2, IndianRupee, Percent } from 'lucide-react';
import { formatCurrency, safeToDate } from '@/lib/utils'; // Assuming safeToDate is still relevant elsewhere
import { useAuth } from '@/hooks/use-auth';
import { trackClickClientSide, TrackClickClientSideData } from '@/lib/actions/tracking';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import * as React from 'react';

interface ProductCardProps {
  product: Product;
  storeContext?: Store; // The store object this product belongs to, if available
}

const isValidHttpUrl = (string: string | undefined | null): boolean => {
  if (!string) return false;
  let url;
  try {
    if (string.startsWith("Error:") || string.startsWith("Unhandled") || string.length > 2048) {
      console.warn("Invalid URL pattern detected in isValidHttpUrl:", string);
      return false;
    }
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
};

const appendClickIdToUrl = (url: string, clickId: string): string => {
  if (!url || !isValidHttpUrl(url)) { // Basic check
    console.warn("Attempted to append click ID to an invalid URL:", url);
    return url; // Or a default fallback URL, e.g., store homepage
  }
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('click_id', clickId); // Using 'click_id' as expected by example function
    // Add other common subid parameters if your networks use them
    urlObj.searchParams.set('subid', clickId);
    urlObj.searchParams.set('aff_sub', clickId);
    return urlObj.toString();
  } catch (e) {
    console.warn("Error appending click ID to URL, returning original:", url, e);
    return url;
  }
};


export default function ProductCard({ product, storeContext }: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessingClick, setIsProcessingClick] = React.useState(false);

  const productTitle = product.name || 'Product Title';
  const placeholderTextForImage = productTitle.substring(0, 15) || "Product";
  const imageUrl = isValidHttpUrl(product.imageUrl)
    ? product.imageUrl!
    : `https://placehold.co/300x300.png?text=${encodeURIComponent(placeholderTextForImage)}`;

  const affiliateLink = product.affiliateLink || storeContext?.affiliateLink || '#';
  const priceDisplay = product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : 'Price not available');

  // Determine cashback display
  let cashbackDisplayString: string | null = null;
  let cashbackTypeForIcon: CashbackType | undefined | null = undefined;
  let calculatedCashbackValue: number | null = null;

  const hasProductSpecificDisplay = product.productSpecificCashbackDisplay && product.productSpecificCashbackDisplay.trim() !== "";
  const hasProductSpecificRate = typeof product.productSpecificCashbackRateValue === 'number' && product.productSpecificCashbackRateValue >= 0;

  if (hasProductSpecificDisplay) {
    cashbackDisplayString = product.productSpecificCashbackDisplay;
    cashbackTypeForIcon = product.productSpecificCashbackType;
    if (hasProductSpecificRate && product.price !== null && product.price !== undefined) {
        if (product.productSpecificCashbackType === 'fixed') {
            calculatedCashbackValue = product.productSpecificCashbackRateValue!;
        } else if (product.productSpecificCashbackType === 'percentage') {
            calculatedCashbackValue = (product.price * product.productSpecificCashbackRateValue!) / 100;
        }
    }
  } else if (hasProductSpecificRate && product.productSpecificCashbackType) {
    cashbackTypeForIcon = product.productSpecificCashbackType;
    if (product.productSpecificCashbackType === 'fixed') {
      cashbackDisplayString = `${formatCurrency(product.productSpecificCashbackRateValue!)} Cashback`;
      if (product.price !== null && product.price !== undefined) calculatedCashbackValue = product.productSpecificCashbackRateValue!;
    } else if (product.productSpecificCashbackType === 'percentage') {
      cashbackDisplayString = `${product.productSpecificCashbackRateValue!}% Cashback`;
      if (product.price !== null && product.price !== undefined) calculatedCashbackValue = (product.price * product.productSpecificCashbackRateValue!) / 100;
    }
  } else if (storeContext?.cashbackRate) { // Fallback to store-level cashback IF NO product-specific rate/type is set
    cashbackDisplayString = storeContext.cashbackRate;
    cashbackTypeForIcon = storeContext.cashbackType;
    if (product.price !== null && product.price !== undefined && typeof storeContext.cashbackRateValue === 'number' && storeContext.cashbackRateValue >= 0) {
      if (storeContext.cashbackType === 'fixed') {
        calculatedCashbackValue = storeContext.cashbackRateValue;
      } else if (storeContext.cashbackType === 'percentage') {
        calculatedCashbackValue = (product.price * storeContext.cashbackRateValue) / 100;
      }
    }
  }

  // Heuristic for icon if type is still missing but display string gives a clue
  if (!cashbackTypeForIcon && cashbackDisplayString) {
    if (cashbackDisplayString.includes("₹") || cashbackDisplayString.toLowerCase().includes("flat")) cashbackTypeForIcon = 'fixed';
    else if (cashbackDisplayString.includes("%")) cashbackTypeForIcon = 'percentage';
  }

  let priceAfterCashback: number | null = null;
  if (product.price !== null && product.price !== undefined && calculatedCashbackValue !== null && calculatedCashbackValue > 0) {
    priceAfterCashback = product.price - calculatedCashbackValue;
  }


  const handleShopNow = async () => {
    setIsProcessingClick(true);
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
        sessionStorage.setItem('loginRedirectUrl', finalAffiliateLinkWithClickId);
        sessionStorage.setItem('loginRedirectSource', router.asPath);
        router.push(`/login?message=Login to track cashback & shop!`);
        setIsProcessingClick(false);
        return;
    }

    const clickData: TrackClickClientSideData = {
        userId: user.uid,
        storeId: product.storeId,
        storeName: storeContext?.name || product.storeName || "Unknown Store",
        productId: product.id,
        productName: product.name,
        clickId: clickId, // The UUID
        affiliateLink: finalAffiliateLinkWithClickId,
        originalLink: affiliateLink, // Base affiliate link for the product
        // Pass the cashback details *as displayed on the card* at the time of click
        clickedCashbackDisplay: product.productSpecificCashbackDisplay || null,
        clickedCashbackRateValue: product.productSpecificCashbackRateValue ?? null,
        clickedCashbackType: product.productSpecificCashbackType || null,
    };
    console.log("ProductCard: Preparing to track click (client-side):", clickData);

    try {
        const trackResult = await trackClickClientSide(clickData);
        if (!trackResult.success) {
            console.error("ProductCard: Failed to track product click (client-side):", trackResult.error);
            toast({title: "Tracking Issue", description: `Could not fully track click. Proceeding to store.`, variant: "destructive", duration: 7000});
        } else {
            console.log("ProductCard: Click tracked successfully (client-side). Click ID:", trackResult.clickId);
        }
    } catch (e) {
        console.error("ProductCard: Error calling trackClickClientSide:", e);
        toast({title: "Tracking Error", description: "An error during click tracking. Proceeding to store.", variant: "destructive", duration: 7000});
    }

    window.open(finalAffiliateLinkWithClickId, '_blank', 'noopener,noreferrer');
    setIsProcessingClick(false);
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
            data-ai-hint={product.dataAiHint || "product item"}
            onError={(e) => {
                (e.target as HTMLImageElement).src = `https://placehold.co/300x300.png?text=${encodeURIComponent(placeholderTextForImage)}`;
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
          <p className="text-base font-semibold text-foreground mb-1">
            {priceDisplay}
          </p>
          {cashbackDisplayString && (
            <p className="text-xs text-green-600 font-semibold mb-1 flex items-center">
              {cashbackTypeForIcon === 'fixed' ? <IndianRupee className="w-3 h-3 mr-0.5 flex-shrink-0"/> : cashbackTypeForIcon === 'percentage' ? <Percent className="w-3 h-3 mr-0.5 flex-shrink-0"/> : null}
              {cashbackDisplayString}
            </p>
          )}
          {priceAfterCashback !== null ? (
            <p className="text-sm font-bold text-primary mb-3">
              Effective Price: {formatCurrency(priceAfterCashback)}
            </p>
          ) : cashbackDisplayString ? (
             <div className="mb-3 h-[20px]"></div>
          ) : (
            <div className="mb-3 h-[38px]"></div>
          )}

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

    