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
    const numericString = priceString.replace(/[^\d.]/g, '');
    const priceValue = parseFloat(numericString);
    if (isNaN(priceValue)) {
      return priceString;
    }
    return `₹${priceValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const displayPrice = formatPrice(product.price);

  return (
    <Card className="flex flex-col h-full overflow-hidden rounded-lg border border-border hover:shadow-lg transition-shadow duration-300 ease-in-out group bg-card">
      {/* Image Section */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted/30"> {/* Use aspect-square for consistency */}
        <a
          href={product.detailPageURL}
          target="_blank"
          rel="noopener noreferrer sponsored"
          title={product.title}
          className="block h-full w-full"
        >
          <Image
            data-ai-hint={`amazon product ${product.title}`}
            src={product.imageUrl || `https://picsum.photos/seed/${product.asin}/300/300`} // Slightly larger placeholder
            alt={product.title}
            fill
            className="object-contain p-3 group-hover:scale-105 transition-transform duration-300 ease-in-out" // Add subtle zoom on hover
            onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/placeholder-${product.asin}/300/300`; }}
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw" // Optimize image loading
          />
        </a>
      </div>

      {/* Content Section */}
      <CardContent className="p-3 flex-grow flex flex-col justify-between space-y-2"> {/* Reduced padding */}
        <a
          href={product.detailPageURL}
          target="_blank"
          rel="noopener noreferrer sponsored"
          title={product.title}
          className="block"
        >
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
            {product.title}
          </h3>
        </a>
        {/* Rating and Price */}
        <div className="flex flex-col gap-1">
           <div className="flex items-center gap-1.5">
             {product.rating !== undefined && product.rating > 0 && renderStars(product.rating)}
             {product.reviewsCount !== undefined && product.reviewsCount > 0 && (
                 <span className="text-xs text-muted-foreground">({product.reviewsCount.toLocaleString()})</span>
             )}
             {/* Show empty stars if no rating */}
             {(product.rating === undefined || product.rating <= 0) && (
                 <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                        <Star key={`empty-placeholder-${i}`} className="w-3.5 h-3.5 text-gray-300 fill-current" />
                    ))}
                 </div>
             )}
           </div>
           {displayPrice && (
             <p className="text-base font-bold text-foreground"> {/* Adjusted price style */}
               {displayPrice}
             </p>
           )}
        </div>
      </CardContent>

      {/* Footer/Action Section */}
      <CardFooter className="p-3 pt-0 mt-auto border-t border-border/50"> {/* Added border */}
        <Button asChild size="sm" className="w-full h-9 text-sm" variant="secondary"> {/* Use secondary variant */}
          <a
            href={product.detailPageURL}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex items-center justify-center gap-1.5"
          >
            View on Amazon
             {/* Optional: Add external link icon */}
             {/* <ExternalLink className="w-3 h-3"/> */}
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
