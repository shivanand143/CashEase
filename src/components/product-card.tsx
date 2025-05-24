
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
  product: Product | null | undefined;
  storeContext?: Store | null | undefined;
}

export default function ProductCard({ product, storeContext }: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessingClick, setIsProcessingClick] = React.useState(false);

  if (!product) {
    return (
      <Card className="overflow-hidden h-full flex flex-col group border shadow-sm p-2"> {/* Reduced padding */}
        <Skeleton className="h-32 w-full bg-muted mb-2" /> {/* Fixed height for image area */}
        <Skeleton className="h-4 w-3/4 mb-1" /> {/* Reduced height */}
        <Skeleton className="h-3 w-1/2 mb-1" /> {/* Reduced height */}
        <Skeleton className="h-3 w-1/3 mb-2" /> {/* Reduced height & margin */}
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  const productTitle = product.name || 'Product Title';
  const placeholderTextForImage = product.name ? product.name.substring(0, 10) : "Product"; // Shorter placeholder

  const imageUrl = product.imageUrl && isValidHttpUrl(product.imageUrl)
    ? product.imageUrl
    : `https://placehold.co/200x200.png?text=${encodeURIComponent(placeholderTextForImage)}`; // Smaller placeholder

  const affiliateLinkToUse = product.affiliateLink || storeContext?.affiliateLink || '#';
  const priceDisplay = product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : 'N/A');

  let cashbackDisplayString: string | null = null;
  let cashbackTypeForIconToUse: CashbackType | undefined | null = undefined;
  let calculatedCashbackValue: number | null = null;
  let priceAfterCashback: number | null = null;

  // Determine cashback display string and type for icon
  if (product.productSpecificCashbackDisplay && product.productSpecificCashbackDisplay.trim() !== "") {
    cashbackDisplayString = product.productSpecificCashbackDisplay;
    cashbackTypeForIconToUse = product.productSpecificCashbackType;
  } else if (product.productSpecificCashbackRateValue != null && product.productSpecificCashbackRateValue >= 0 && product.productSpecificCashbackType) {
    cashbackTypeForIconToUse = product.productSpecificCashbackType;
    if (product.productSpecificCashbackType === 'fixed') {
      cashbackDisplayString = `₹${product.productSpecificCashbackRateValue} Cashback`;
    } else if (product.productSpecificCashbackType === 'percentage') {
      cashbackDisplayString = `${product.productSpecificCashbackRateValue}% Cashback`;
    }
  } else if (storeContext?.cashbackRate) {
    cashbackDisplayString = storeContext.cashbackRate;
    cashbackTypeForIconToUse = storeContext.cashbackType;
    // Heuristic if type is missing
    if (!cashbackTypeForIconToUse) {
      if (cashbackDisplayString.toLowerCase().includes("₹") || cashbackDisplayString.toLowerCase().includes("flat")) {
        cashbackTypeForIconToUse = 'fixed';
      } else if (cashbackDisplayString.includes("%")) {
        cashbackTypeForIconToUse = 'percentage';
      }
    }
  }

  // Calculate cashback amount
  if (product.price !== null && product.price !== undefined && product.price > 0) {
    let rateToUse: number | null = null;
    let typeToUse: CashbackType | null = null;

    if (product.productSpecificCashbackRateValue != null && product.productSpecificCashbackRateValue >= 0 && product.productSpecificCashbackType) {
      rateToUse = product.productSpecificCashbackRateValue;
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

  // Calculate price after cashback
  if (product.price !== null && product.price !== undefined && calculatedCashbackValue !== null && calculatedCashbackValue > 0) {
    priceAfterCashback = product.price - calculatedCashbackValue;
  }

  const handleShopNow = async () => {
    setIsProcessingClick(true);
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

    if (!user) {
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

    try {
      const trackResult = await trackClickClientSide(clickData);
      if (!trackResult.success) {
        toast({ title: "Tracking Issue", description: `Could not fully track click. Error: ${trackResult.error}. Proceeding to store.`, variant: "destructive", duration: 7000 });
      }
    } catch (e: any) {
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
        <a className="block h-32 w-full relative overflow-hidden bg-muted p-1"> {/* Fixed height, reduced padding */}
            <Image
            src={imageUrl}
            alt={productTitle}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className="object-contain group-hover:scale-105 transition-transform duration-300"
            data-ai-hint={product.dataAiHint || "product item"}
            onError={(e) => {
                (e.target as HTMLImageElement).src = `https://placehold.co/200x200.png?text=${encodeURIComponent(placeholderTextForImage)}`;
            }}
            />
        </a>
      </Link>
      <CardContent className="p-2 flex flex-col flex-grow justify-between"> {/* Reduced padding */}
        <div>
          <h3 className="text-xs font-medium leading-snug mb-0.5 h-8 line-clamp-2" title={productTitle}> {/* Smaller font, fixed height */}
            <Link href={`/stores/${product.storeId}/products?highlight=${product.id}`} className="hover:text-primary transition-colors">
                {productTitle}
            </Link>
          </h3>
           {(storeContext?.name || product.storeName) && (
             <Link href={`/stores/${product.storeId}`} className="text-[11px] text-muted-foreground hover:text-primary transition-colors mb-0.5 block truncate"> {/* Smaller font */}
               From: {storeContext?.name || product.storeName}
             </Link>
           )}
        </div>
        <div className="mt-auto">
          <p className="text-sm font-semibold text-foreground mb-0.5"> {/* Smaller font */}
            {priceDisplay}
          </p>

          {cashbackDisplayString && (
            <p className="text-[10px] text-green-600 font-semibold mb-0.5 flex items-center"> {/* Smaller font */}
              {cashbackTypeForIconToUse === 'fixed' ? <IndianRupee className="w-2.5 h-2.5 mr-0.5 flex-shrink-0"/> : cashbackTypeForIconToUse === 'percentage' ? <Percent className="w-2.5 h-2.5 mr-0.5 flex-shrink-0"/> : null}
              {cashbackDisplayString}
            </p>
          )}

          {priceAfterCashback !== null && cashbackDisplayString ? ( // Only show if original cashback string was shown
            <p className="text-[10px] font-bold text-primary mb-1"> {/* Smaller font */}
              Effective Price: {formatCurrency(priceAfterCashback)}
            </p>
          ) : cashbackDisplayString ? (
             <div className="mb-1 h-[15px]"></div> // Smaller spacer
          ) : (
            <div className="mb-1 h-[30px]"></div> // Adjust spacer height
          )}

          <Button
            size="sm"
            className="w-full text-xs h-8 px-2 py-1" // Custom smaller button
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
