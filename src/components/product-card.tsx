
"use client";

import type { Product, Store, CashbackType } from '@/lib/types';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, ShoppingCart, Loader2, IndianRupee, Percent } from 'lucide-react';
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
        console.warn("Invalid URL pattern detected in isValidHttpUrl:", string);
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
    urlObj.searchParams.set('s1', clickId);
    return urlObj.toString();
  } catch (e) {
    console.warn("Invalid URL for click tracking, returning original:", url, e);
    return url;
  }
};

export default function ProductCard({ product, storeContext }: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessingClick, setIsProcessingClick] = React.useState(false);

  if (!product || !product.name) {
    const placeholderText = "Product";
    const tempImageUrl = `https://placehold.co/300x300.png?text=${encodeURIComponent(placeholderText)}`;
    return (
      <Card className="overflow-hidden h-full flex flex-col group border shadow-sm">
        <div className="block aspect-square relative overflow-hidden bg-muted">
            <Image
            src={tempImageUrl}
            alt={placeholderText}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className="object-contain group-hover:scale-105 transition-transform duration-300 p-2"
            data-ai-hint={"product image"}
            />
        </div>
        <CardContent className="p-3 flex flex-col flex-grow justify-between">
          <div>
            <h3 className="text-sm font-medium leading-snug mb-1 h-10 line-clamp-2" title={placeholderText}>
                {placeholderText}
            </h3>
            <p className="text-xs text-muted-foreground mb-1">Store: Unknown</p>
          </div>
          <div className="mt-auto">
            <p className="text-base font-semibold text-primary mb-3">
              Price not available
            </p>
            <Button size="sm" className="w-full text-xs bg-amber-500 hover:bg-amber-600 text-white" disabled>
              <ShoppingCart className="mr-1 h-3 w-3" /> Shop Now
            </Button>
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
  const affiliateLink = product.affiliateLink || '#';
  const priceDisplay = product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : 'Price not available');

  const hasProductSpecificCashback = !!product.productSpecificCashbackDisplay;
  const cashbackDisplay = hasProductSpecificCashback ? product.productSpecificCashbackDisplay : storeContext?.cashbackRate || null;
  const cashbackTypeForIcon = hasProductSpecificCashback ? product.productSpecificCashbackType : storeContext?.cashbackType;


  const handleShopNow = async () => {
    setIsProcessingClick(true);
    console.log("ProductCard: handleShopNow triggered for product:", product.id, "User:", user?.uid);

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
        clickId: clickId,
        affiliateLink: finalAffiliateLinkWithClickId,
        originalLink: affiliateLink,
        clickedCashbackDisplay: product.productSpecificCashbackDisplay || null,
        clickedCashbackRateValue: product.productSpecificCashbackRateValue ?? null,
        clickedCashbackType: product.productSpecificCashbackType || null,
    };

    console.log("ProductCard: Preparing to track click (client-side):", clickData);

    try {
        const trackResult = await trackClickClientSide(clickData);
        if (trackResult.success) {
            console.log(`ProductCard: Click tracked successfully (client-side) for Product ${product.id}, ClickID ${trackResult.clickId}`);
        } else {
            console.error("ProductCard: Failed to track product click (client-side util error):", trackResult.error);
            toast({title: "Tracking Issue", description: `Could not fully track click: ${trackResult.error}. Proceeding to store.`, variant: "destructive", duration: 7000});
        }
    } catch (e) {
        console.error("ProductCard: Error calling trackClickClientSide:", e);
        toast({title: "Tracking Error", description: "An unexpected error during click tracking. Proceeding to store.", variant: "destructive", duration: 7000});
    }

    console.log("ProductCard: Opening affiliate link in new tab:", finalAffiliateLinkWithClickId);
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
          <p className="text-base font-semibold text-primary mb-1"> {/* Price first */}
            {priceDisplay}
          </p>
          {cashbackDisplay && (
            <p className="text-xs text-green-600 font-semibold mb-3 flex items-center"> {/* Cashback second, increased bottom margin */}
              {cashbackTypeForIcon === 'fixed' ? <IndianRupee className="w-3 h-3 mr-0.5"/> : <Percent className="w-3 h-3 mr-0.5"/>}
              {cashbackDisplay} Cashback
            </p>
          )}
          {!cashbackDisplay && <div className="mb-3 h-[18px]"></div> /* Placeholder for consistent button spacing if no cashback */}
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
