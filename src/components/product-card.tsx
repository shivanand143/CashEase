
"use client";

import type { Product, Store, CashbackType } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Loader2, IndianRupee, Percent } from 'lucide-react';
import { formatCurrency, isValidHttpUrl, appendClickIdToUrl } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { trackClickClientSide, type TrackClickClientSideData } from '@/lib/actions/tracking';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';


interface ProductCardProps {
  product: Product | null | undefined; // Allow product to be potentially null or undefined
  storeContext?: Store | null | undefined; // Allow storeContext to be potentially null or undefined
}

export default function ProductCard({ product, storeContext }: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessingClick, setIsProcessingClick] = React.useState(false);

  if (!product) {
    // Render a skeleton or placeholder if product data is not available
    return (
      <Card className="overflow-hidden h-full flex flex-col group border shadow-sm p-3">
        <Skeleton className="aspect-[4/3] w-full bg-muted mb-2" />
        <Skeleton className="h-5 w-3/4 mb-1" />
        <Skeleton className="h-4 w-1/2 mb-1" />
        <Skeleton className="h-4 w-1/3 mb-3" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  const productTitle = product.name || 'Product Title';
  const placeholderTextForImage = product.name ? product.name.substring(0, 15) : "Product";

  const imageUrl = product.imageUrl && isValidHttpUrl(product.imageUrl)
    ? product.imageUrl
    : `https://placehold.co/300x225.png?text=${encodeURIComponent(placeholderTextForImage)}`;

  const affiliateLinkToUse = product.affiliateLink || storeContext?.affiliateLink || '#';
  const priceDisplay = product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : 'Price not available');

  let cashbackDisplayString: string | null = null;
  let cashbackTypeForIconToUse: CashbackType | undefined | null = undefined;
  let calculatedCashbackValue: number | null = null;

  const hasProductSpecificDisplay = product.productSpecificCashbackDisplay && product.productSpecificCashbackDisplay.trim() !== "";
  const hasProductSpecificRate = typeof product.productSpecificCashbackRateValue === 'number' && product.productSpecificCashbackRateValue >= 0;

  if (hasProductSpecificDisplay) {
    cashbackDisplayString = product.productSpecificCashbackDisplay;
    cashbackTypeForIconToUse = product.productSpecificCashbackType;
  } else if (hasProductSpecificRate && product.productSpecificCashbackType) {
    cashbackTypeForIconToUse = product.productSpecificCashbackType;
    if (product.productSpecificCashbackType === 'fixed') {
      cashbackDisplayString = `${formatCurrency(product.productSpecificCashbackRateValue!)} Cashback`;
    } else if (product.productSpecificCashbackType === 'percentage') {
      cashbackDisplayString = `${product.productSpecificCashbackRateValue!}% Cashback`;
    }
  } else if (storeContext?.cashbackRate) {
    cashbackDisplayString = storeContext.cashbackRate;
    cashbackTypeForIconToUse = storeContext.cashbackType;
    // Use heuristic if type is still undefined but display string gives a clue
    if (!cashbackTypeForIconToUse) {
      if (cashbackDisplayString.includes("₹") || cashbackDisplayString.toLowerCase().includes("flat")) cashbackTypeForIconToUse = 'fixed';
      else if (cashbackDisplayString.includes("%")) cashbackTypeForIconToUse = 'percentage';
    }
  }


  if (product.price !== null && product.price !== undefined) {
    let rateToUse: number | null = null;
    let typeToUse: CashbackType | null = null;

    if (hasProductSpecificRate && product.productSpecificCashbackType) {
      rateToUse = product.productSpecificCashbackRateValue!;
      typeToUse = product.productSpecificCashbackType;
    } else if (storeContext?.cashbackRateValue !== undefined && storeContext.cashbackRateValue >= 0 && storeContext.cashbackType) {
      rateToUse = storeContext.cashbackRateValue;
      typeToUse = storeContext.cashbackType;
    }

    if (rateToUse !== null && typeToUse !== null) {
      if (typeToUse === 'fixed') {
        calculatedCashbackValue = rateToUse;
      } else if (typeToUse === 'percentage') {
        calculatedCashbackValue = (product.price * rateToUse) / 100;
      }
    }
  }

  let priceAfterCashback: number | null = null;
  if (product.price !== null && product.price !== undefined && calculatedCashbackValue !== null && calculatedCashbackValue > 0) {
    priceAfterCashback = product.price - calculatedCashbackValue;
  }

  const handleShopNow = async () => {
    setIsProcessingClick(true);
    console.log("ProductCard: handleShopNow triggered for product:", product.id);

    if (authLoading) {
      toast({ title: "Please wait", description: "Checking authentication..." });
      setIsProcessingClick(false);
      return;
    }
    if (affiliateLinkToUse === '#') {
      toast({ title: "Link Error", description: "Product link is not available.", variant: "destructive" });
      setIsProcessingClick(false);
      return;
    }

    const clickId = uuidv4();
    const finalAffiliateLinkWithClickId = appendClickIdToUrl(affiliateLinkToUse, clickId, storeContext?.affiliateLink);
    console.log("ProductCard: Generated Click ID:", clickId, "Final URL:", finalAffiliateLinkWithClickId);

    if (!user) {
      console.log("ProductCard: User not logged in. Storing redirect and navigating to login.");
      sessionStorage.setItem('loginRedirectUrl', finalAffiliateLinkWithClickId);
      sessionStorage.setItem('loginRedirectSource', router.asPath);
      router.push(`/login?message=Login to track cashback & shop this product!`);
      setIsProcessingClick(false);
      return;
    }

    const clickData: TrackClickClientSideData = {
      userId: user.uid,
      storeId: product.storeId,
      storeName: storeContext?.name || product.storeName || "Unknown Store",
      productId: product.id,
      productName: product.name,
      clickId: clickId,
      affiliateLink: finalAffiliateLinkWithClickId,
      originalLink: affiliateLinkToUse,
      clickedCashbackDisplay: cashbackDisplayString,
      clickedCashbackRateValue: product.productSpecificCashbackRateValue ?? storeContext?.cashbackRateValue ?? null,
      clickedCashbackType: cashbackTypeForIconToUse ?? product.productSpecificCashbackType ?? storeContext?.cashbackType ?? null,
    };
    console.log("ProductCard: Preparing to track click (client-side):", clickData);

    try {
      const trackResult = await trackClickClientSide(clickData);
      if (!trackResult.success) {
        console.error("ProductCard: Failed to track product click (client-side util error):", trackResult.error);
        toast({ title: "Tracking Issue", description: `Could not fully track click. Error: ${trackResult.error}. Proceeding to store.`, variant: "destructive", duration: 7000 });
      } else {
        console.log("ProductCard: Click tracked successfully (client-side).");
      }
    } catch (e: any) {
      console.error("ProductCard: Error calling trackClickClientSide:", e);
      toast({ title: "Tracking Error", description: `An error during click tracking: ${e.message}. Proceeding to store.`, variant: "destructive", duration: 7000 });
    }

    if (finalAffiliateLinkWithClickId && finalAffiliateLinkWithClickId !== '#') {
        window.open(finalAffiliateLinkWithClickId, '_blank', 'noopener,noreferrer');
    } else {
        toast({title: "Navigation Error", description: "Could not determine a valid link to open.", variant: "destructive"});
    }
    setIsProcessingClick(false);
  };


  return (
    <Card className="overflow-hidden h-full flex flex-col group border shadow-sm hover:shadow-lg transition-shadow duration-300">
      <Link href={`/stores/${product.storeId}/products?highlight=${product.id}`} passHref legacyBehavior>
        <a className="block aspect-[4/3] relative overflow-hidden bg-muted">
            <Image
            src={imageUrl}
            alt={productTitle}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className="object-contain group-hover:scale-105 transition-transform duration-300 p-2"
            data-ai-hint={product.dataAiHint || "product item"}
            onError={(e) => {
                (e.target as HTMLImageElement).src = `https://placehold.co/300x225.png?text=${encodeURIComponent(placeholderTextForImage)}`;
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
            <p className="text-xs text-green-600 font-semibold mb-0.5 flex items-center">
              {cashbackTypeForIconToUse === 'fixed' ? <IndianRupee className="w-3 h-3 mr-0.5 flex-shrink-0"/> : cashbackTypeForIconToUse === 'percentage' ? <Percent className="w-3 h-3 mr-0.5 flex-shrink-0"/> : null}
              {cashbackDisplayString}
            </p>
          )}

          {priceAfterCashback !== null ? (
            <p className="text-xs font-bold text-primary mb-2">
              Effective Price: {formatCurrency(priceAfterCashback)}
            </p>
          ) : cashbackDisplayString ? (
             <div className="mb-2 h-[18px]"></div>
          ) : (
            <div className="mb-2 h-[36px]"></div>
          )}

          <Button
            size="sm"
            className="w-full text-xs bg-accent hover:bg-accent/90 text-accent-foreground py-2"
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
