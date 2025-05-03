// src/components/product-card.tsx
import Image from 'next/image';
import Link from 'next/link'; // Use NextLink for internal navigation if needed, otherwise standard 'a'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react'; // Assuming use of lucide-react for icons

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
  // Add any interaction handlers if needed, e.g., onAddToCart
}

export default function ProductCard({ product }: ProductCardProps) {
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 !== 0;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    return (
      <div className="flex items-center text-amber-500">
        {[...Array(fullStars)].map((_, i) => (
          <Star key={`full-${i}`} className="w-4 h-4 fill-current" />
        ))}
        {halfStar && <Star key="half" className="w-4 h-4 fill-current" style={{ clipPath: 'inset(0 50% 0 0)' }} />}
        {[...Array(emptyStars)].map((_, i) => (
          <Star key={`empty-${i}`} className="w-4 h-4 text-gray-300" />
        ))}
      </div>
    );
  };

  // Helper to attempt extracting number and format with INR symbol
  const formatPrice = (priceString?: string): string | undefined => {
    if (!priceString) return undefined;
    // Remove non-numeric characters except decimal point
    const numericString = priceString.replace(/[^\d.]/g, '');
    const priceValue = parseFloat(numericString);
    if (isNaN(priceValue)) {
      // If parsing fails, return original string or some default
      return priceString; // Or maybe 'Price unavailable'
    }
    // Format with INR symbol
    return `₹${priceValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const displayPrice = formatPrice(product.price);

  return (
    <Card className="flex flex-col h-full overflow-hidden hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="p-0 items-center">
        {/* Use 'a' tag for external affiliate link */}
        <a
            href={product.detailPageURL}
            target="_blank"
            rel="noopener noreferrer sponsored" // 'sponsored' is recommended for affiliate links
            title={product.title}
            className="block aspect-square w-full relative" // Make link cover the image area
         >
           <Image
             data-ai-hint={`amazon product ${product.title}`}
             src={product.imageUrl || `https://picsum.photos/seed/${product.asin}/250/250`} // Fallback image
             alt={product.title}
             fill // Use fill for responsive image sizing within aspect ratio container
             className="object-contain p-2" // Contain keeps aspect ratio, padding adds space
             onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/placeholder-${product.asin}/250/250`; }}
           />
         </a>
      </CardHeader>
      <CardContent className="p-4 flex-grow space-y-2">
        <a
           href={product.detailPageURL}
           target="_blank"
           rel="noopener noreferrer sponsored"
           title={product.title}
           className="block"
        >
           <h3 className="font-semibold text-sm line-clamp-2 hover:text-primary transition-colors">
             {product.title}
           </h3>
        </a>
        <div className="flex items-center gap-2">
           {product.rating !== undefined && product.rating > 0 && (
               <>
                 {renderStars(product.rating)}
                 {product.reviewsCount !== undefined && (
                   <span className="text-xs text-muted-foreground">({product.reviewsCount.toLocaleString()})</span>
                 )}
               </>
           )}
         </div>
         {displayPrice && (
           <p className="text-lg font-bold text-destructive">
             {displayPrice}
           </p>
         )}
         {/* Optionally add a short description if available */}
         {/* <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p> */}
      </CardContent>
      <CardFooter className="p-4 pt-0 mt-auto">
        {/* Use 'a' tag for external affiliate link */}
        <Button asChild size="sm" className="w-full">
          <a
            href={product.detailPageURL}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            View on Amazon
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
