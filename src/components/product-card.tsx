// src/components/product-card.tsx
import Image from 'next/image';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils'; // Import cn utility

interface Product {
  asin: string;
  title: string;
  imageUrl?: string;
  price?: string;
  rating?: number;
  reviewsCount?: number;
  detailPageURL: string; // Affiliate link from Amazon
}

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    return (
      <div className="flex items-center text-amber-400"> {/* Slightly lighter amber */}
        {[...Array(fullStars)].map((_, i) => (
          <Star key={`full-${i}`} className="w-3.5 h-3.5 fill-current" /> // Smaller stars
        ))}
        {/* Add half star rendering if needed */}
        {[...Array(emptyStars)].map((_, i) => (
          <Star key={`empty-${i}`} className="w-3.5 h-3.5 text-gray-300 fill-current" /> // Fill empty stars for consistency
        ))}
      </div>
    );
  };

  // Helper to attempt extracting number and format with INR symbol
  const formatPrice = (priceString?: string): string | undefined => {
    if (!priceString) return undefined;
    // Remove currency symbols, commas, and ensure only one decimal point remains if needed.
    // This regex handles cases like ₹1,299.00, $19.99 etc. more robustly
    const numericString = priceString.replace(/[^0-9.]/g, '');
    const priceValue = parseFloat(numericString);
    if (isNaN(priceValue)) {
        // If it's still not a number after cleaning, return the original string or an indicator
        return priceString; // Or maybe 'Price not available'
    }
    // Format specifically for INR
    return `₹${priceValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };


  const displayPrice = formatPrice(product.price);

  const handleProductClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Optional: Add any client-side tracking here if needed before navigation
      // console.log(`Navigating to: ${product.detailPageURL}`);
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden rounded-lg border border-border hover:shadow-xl transition-shadow duration-300 ease-in-out group bg-card">
      {/* Image Section */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted/30"> {/* Use aspect-square for consistency */}
        <a
          href={product.detailPageURL}
          target="_blank"
          rel="noopener noreferrer sponsored"
          title={product.title}
          className="block h-full w-full"
          onClick={handleProductClick}
        >
          <Image
            data-ai-hint={`amazon product ${product.title}`}
            src={product.imageUrl || `https://picsum.photos/seed/${product.asin}/300/300`} // Slightly larger placeholder
            alt={product.title}
            fill
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-300 ease-in-out" // Added more padding
            onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/placeholder-${product.asin}/300/300`; }}
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw" // Optimize image loading
          />
        </a>
      </div>

      {/* Content Section */}
      <CardContent className="p-3 flex-grow flex flex-col justify-between space-y-1.5"> {/* Adjusted spacing */}
        <a
          href={product.detailPageURL}
          target="_blank"
          rel="noopener noreferrer sponsored"
          title={product.title}
          className="block"
           onClick={handleProductClick}
        >
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200 h-[2.5em]"> {/* Fixed height */}
            {product.title}
          </h3>
        </a>
        {/* Rating and Price */}
        <div className="flex flex-col gap-0.5"> {/* Reduced gap */}
           <div className="flex items-center gap-1"> {/* Reduced gap */}
             {product.rating !== undefined && product.rating > 0 ? renderStars(product.rating) : (
                 <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                        <Star key={`empty-placeholder-${i}`} className="w-3.5 h-3.5 text-gray-300 fill-current" />
                    ))}
                 </div>
             )}
             {product.reviewsCount !== undefined && product.reviewsCount > 0 && (
                 <span className="text-xs text-muted-foreground">({product.reviewsCount.toLocaleString()})</span>
             )}
           </div>
           {displayPrice && (
             <p className="text-base font-bold text-foreground"> {/* Adjusted price style */}
               {displayPrice}
             </p>
           )}
        </div>
      </CardContent>

      {/* Footer/Action Section - Changed Button usage */}
      <CardFooter className="p-2 pt-0 mt-auto border-t border-border/50"> {/* Adjusted padding */}
          {/* Wrap the Button content in the anchor tag instead of using asChild */}
          <a
            href={product.detailPageURL}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="w-full block" // Anchor takes full width
             onClick={handleProductClick}
          >
              <Button size="sm" className="w-full h-9 text-sm" variant="secondary">
                  View on Amazon
              </Button>
          </a>
      </CardFooter>
    </Card>
  );
}
