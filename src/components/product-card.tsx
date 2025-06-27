
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
import { usePathname } from 'next/navigation';

interface ProductCardProps {
  product: Product | null | undefined;
  storeContext?: Store | null | undefined;
}

export default function ProductCard({ product, storeContext }: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessingClick, setIsProcessingClick] = React.useState(false);
  const pathname = usePathname();

  if (!product) {
    return (
      <Card className="overflow-hidden h-full flex flex-col group border shadow-sm p-2">
        <Skeleton className="h-32 w-full bg-muted mb-2" />
        <Skeleton className="h-4 w-3/4 mb-1" />
        <Skeleton className="h-3 w-1/2 mb-1" />
        <Skeleton className="h-3 w-1/3 mb-2" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  const productTitle = product.name || 'Product Title';
  const placeholderTextForImage = product.name ? product.name.substring(0, 15) : "Product";

  const imageUrl = product.imageUrl && isValidHttpUrl(product.imageUrl)
    ? product.imageUrl
    : `https://placehold.co/200x200.png?text=${encodeURIComponent(placeholderTextForImage)}`;

  const affiliateLinkToUse = product.affiliateLink || storeContext?.affiliateLink || '#';
  const priceDisplay = product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : 'N/A');

  let cashbackDisplayString: string | null = null;
  let cashbackTypeForIconToUse: CashbackType | undefined | null = undefined;
  let calculatedCashbackValue: number | null = null;
  let priceAfterCashback: number | null = null;

  // 1. Prioritize product-specific cashback if "Cashback Display Text" is explicitly set
  if (product.productSpecificCashbackDisplay && product.productSpecificCashbackDisplay.trim() !== "") {
    cashbackDisplayString = product.productSpecificCashbackDisplay;
    cashbackTypeForIconToUse = product.productSpecificCashbackType; // Use product's type
  }
  // 2. Else, if numerical product-specific cashback is set, construct a display string
  else if (product.productSpecificCashbackRateValue != null && product.productSpecificCashbackRateValue >= 0 && product.productSpecificCashbackType) {
    cashbackTypeForIconToUse = product.productSpecificCashbackType;
    if (product.productSpecificCashbackType === 'fixed') {
      cashbackDisplayString = `${formatCurrency(product.productSpecificCashbackRateValue)} Cashback`;
    } else if (product.productSpecificCashbackType === 'percentage') {
      cashbackDisplayString = `${product.productSpecificCashbackRateValue}% Cashback`;
    }
  }
  // 3. Else, fall back to store-level cashback display string
  else if (storeContext?.cashbackRate) {
    cashbackDisplayString = storeContext.cashbackRate;
    cashbackTypeForIconToUse = storeContext.cashbackType;
    // Heuristic for store cashback type if not explicitly defined
    if (!cashbackTypeForIconToUse) {
      if (cashbackDisplayString.toLowerCase().includes("₹") || cashbackDisplayString.toLowerCase().includes("flat")) {
        cashbackTypeForIconToUse = 'fixed';
      } else if (cashbackDisplayString.includes("%")) {
        cashbackTypeForIconToUse = 'percentage';
      }
    }
  }

  // Calculate effective price after cashback
  if (product.price !== null && product.price !== undefined && product.price > 0) {
    let rateValueForCalc: number | null = null;
    let typeForCalc: CashbackType | null = null;

    if (product.productSpecificCashbackRateValue != null && product.productSpecificCashbackRateValue >= 0 && product.productSpecificCashbackType) {
      rateValueForCalc = product.productSpecificCashbackRateValue;
      typeForCalc = product.productSpecificCashbackType;
    } else if (storeContext?.cashbackRateValue !== undefined && storeContext.cashbackRateValue >= 0 && storeContext.cashbackType) {
      rateValueForCalc = storeContext.cashbackRateValue;
      typeForCalc = storeContext.cashbackType;
    }

    if (rateValueForCalc !== null && typeForCalc !== null) {
      if (typeForCalc === 'fixed') {
        calculatedCashbackValue = rateValueForCalc;
      } else if (typeForCalc === 'percentage') {
        calculatedCashbackValue = (product.price * rateValueForCalc) / 100;
      }
    }
  }

  if (product.price !== null && product.price !== undefined && calculatedCashbackValue !== null && calculatedCashbackValue > 0) {
    priceAfterCashback = product.price - calculatedCashbackValue;
  }

  const handleShopNow = async () => {
    setIsProcessingClick(true);
    console.log("ProductCard: handleShopNow triggered for product:", product.id, product.name);

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
      sessionStorage.setItem('loginRedirectSource', pathname); // Store current page as source
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
      clickedCashbackDisplay: cashbackDisplayString, // Log what was displayed
      clickedCashbackRateValue: product.productSpecificCashbackRateValue ?? storeContext?.cashbackRateValue ?? null,
      clickedCashbackType: product.productSpecificCashbackType ?? storeContext?.cashbackType ?? null,
    };

    console.log("ProductCard: Tracking click with data (client-side):", clickData);

    try {
      const trackResult = await trackClickClientSide(clickData);
      if (trackResult.success) {
        console.log("ProductCard: Click tracked successfully (client-side), Click ID:", trackResult.clickId);
      } else {
        toast({ title: "Tracking Issue", description: `Could not fully track click. Error: ${trackResult.error}. Proceeding to store.`, variant: "destructive", duration: 7000 });
        console.error("ProductCard: Failed to track product click (client-side util error):", trackResult.error);
      }
    } catch (e: any) {
      toast({ title: "Tracking Error", description: `An error during click tracking: ${e.message}. Proceeding to store.`, variant: "destructive", duration: 7000 });
      console.error("ProductCard: Exception during trackClickClientSide:", e);
    }

    if (finalAffiliateLinkWithClickId && finalAffiliateLinkWithClickId !== '#') {
      window.open(finalAffiliateLinkWithClickId, '_blank', 'noopener,noreferrer');
    } else {
      toast({ title: "Navigation Error", description: "Could not determine a valid link to open.", variant: "destructive" });
    }
    setIsProcessingClick(false);
  };


  return (
    <Card className="overflow-hidden h-full flex flex-col group border shadow-sm hover:shadow-lg transition-shadow duration-300">
      <Link
        href={`/stores/${product.storeId}/products?highlight=${product.id}`}
        className="block aspect-[1/1] w-full relative overflow-hidden bg-muted p-1"
      >
        <Image
            src={imageUrl}
            alt={productTitle}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className="object-contain group-hover:scale-105 transition-transform duration-300"
            data-ai-hint={product.dataAiHint || "product item"}
            onError={(e) => {
                (e.target as HTMLImageElement).src = `https://placehold.co/150x150.png?text=${encodeURIComponent(placeholderTextForImage)}`;
            }}
        />
      </Link>
      <CardContent className="p-2 flex flex-col flex-grow justify-between">
        <div>
          <h3 className="text-xs font-medium leading-snug mb-0.5 h-8 line-clamp-2" title={productTitle}>
            <Link href={`/stores/${product.storeId}/products?highlight=${product.id}`} className="hover:text-primary transition-colors">
                {productTitle}
            </Link>
          </h3>
           {(storeContext?.name || product.storeName) && (
             <Link href={`/stores/${product.storeId}`} className="text-[10px] text-muted-foreground hover:text-primary transition-colors mb-0.5 block truncate">
               From: {storeContext?.name || product.storeName}
             </Link>
           )}
        </div>
        <div className="mt-auto">
          <p className="text-sm font-semibold text-foreground mb-1">
            {priceDisplay}
          </p>

          <div className="min-h-[30px] space-y-0.5 mb-1.5">
            {cashbackDisplayString && (
              <p className="text-[10px] text-green-600 font-semibold flex items-center">
                {cashbackTypeForIconToUse === 'fixed' ? <IndianRupee className="w-2.5 h-2.5 mr-0.5 flex-shrink-0"/> : cashbackTypeForIconToUse === 'percentage' ? <Percent className="w-2.5 h-2.5 mr-0.5 flex-shrink-0"/> : null}
                {cashbackDisplayString}
              </p>
            )}

            {(priceAfterCashback !== null && priceAfterCashback >= 0 && product.price && product.price > priceAfterCashback) && (
              <p className="text-[10px] font-bold text-primary">
                Effective Price: {formatCurrency(priceAfterCashback)}
              </p>
            )}
          </div>

          <Button
            size="sm"
            className="w-full text-xs h-8 px-2 py-1"
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
