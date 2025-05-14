
"use client";

import type { Product, Store } from '@/lib/types'; // Store type might be needed for context
import Image from 'next/image';
import Link from 'next/link'; // For linking to product details on your site (optional)
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, ShoppingCart } from 'lucide-react'; // Using ShoppingCart for "Shop Now"
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { trackClick } from '@/lib/actions/tracking';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface ProductCardProps {
  product: Product;
  storeContext?: Store; // Optional: pass store context if available (e.g., for better tracking)
}

// Basic check to see if a string looks like a valid HTTP/S URL
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

  const imageUrl = isValidHttpUrl(product.imageUrl)
    ? product.imageUrl
    : `https://placehold.co/300x300.png?text=${encodeURIComponent(product.name.substring(0,15))}`;

  const productTitle = product.name || 'Product Title';
  const affiliateLink = product.affiliateLink || '#';
  const category = product.category || 'Uncategorized';
  const priceDisplay = product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : 'Price not available');

  const handleShopNow = async () => {
    if (authLoading) {
      toast({ title: "Please wait", description: "Checking authentication..."});
      return;
    }

    // If not logged in, redirect to login, saving intended destination
    if (!user) {
        sessionStorage.setItem('loginRedirectUrl', affiliateLink);
        sessionStorage.setItem('loginRedirectSource', router.asPath); // current page
        router.push('/login?message=Please login to track your cashback for this product.');
        return;
    }

    const clickId = uuidv4();
    const finalAffiliateLink = appendClickIdToUrl(affiliateLink, clickId);

    try {
        await trackClick({
            userId: user.uid,
            storeId: product.storeId,
            storeName: storeContext?.name || product.storeName || 'Unknown Store',
            productId: product.id, // Pass product ID
            productName: product.name, // Pass product name
            couponId: null, // No specific coupon for a product click like this
            clickId: clickId,
            affiliateLink: finalAffiliateLink, // The link with click ID
            timestamp: new Date(),
        });
        console.log(`Product click tracked: User ${user.uid}, Product ${product.id}, ClickID ${clickId}`);
    } catch (e) {
        console.error("Failed to track product click:", e);
        // Don't block the user, but maybe log this error more formally
    }

    window.open(finalAffiliateLink, '_blank', 'noopener,noreferrer');
  };


  return (
    <Card className="overflow-hidden h-full flex flex-col group border shadow-sm hover:shadow-lg transition-shadow duration-300">
      {/* Product Image - Potentially make it a link to a product detail page on *your* site if you have one */}
      <div className="block aspect-square relative overflow-hidden bg-muted">
        <Image
          src={imageUrl}
          alt={productTitle}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
          className="object-contain group-hover:scale-105 transition-transform duration-300 p-2"
          data-ai-hint={product.dataAiHint || "product image"}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://placehold.co/300x300.png?text=${encodeURIComponent(product.name.substring(0,15))}`;
          }}
        />
      </div>
      <CardContent className="p-3 flex flex-col flex-grow justify-between">
        <div>
          {/* Category (optional) */}
          {/* <p className="text-xs text-muted-foreground mb-1">{category}</p> */}
          <h3 className="text-sm font-medium leading-snug mb-2 h-10 line-clamp-2" title={productTitle}>
            {/* If you have product detail pages on your site: <Link href={`/product/${product.id}`} className="hover:text-primary transition-colors">{productTitle}</Link> */}
            {productTitle}
          </h3>
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
            {authLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShoppingCart className="mr-1 h-3 w-3" />}
            Shop Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

    