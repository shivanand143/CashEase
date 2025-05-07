// src/components/product-card.tsx
"use client";

import type { AmazonProduct } from '@/lib/amazon/amazon-paapi'; // Adjust path as necessary
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { formatCurrency } from '@/lib/utils'; // Assuming you have this utility

interface ProductCardProps {
  product: AmazonProduct;
}

// Basic check to see if a string looks like a valid HTTP/S URL
const isValidHttpUrl = (string: string | undefined | null): boolean => {
  if (!string) return false;
  let url;
  try {
    // Check if the string starts with common error messages or is too long to be a URL
    if (string.startsWith("Error:") || string.startsWith("Unhandled") || string.length > 2048) {
        return false;
    }
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function ProductCard({ product }: ProductCardProps) {
  // Validate ImageURL before using it
  const imageUrl = isValidHttpUrl(product.ImageURL)
    ? product.ImageURL
    : 'https://picsum.photos/seed/productplaceholder/200/200'; // Fallback image

  const productTitle = product.Title || 'Product Title';
  const detailPageUrl = product.DetailPageURL || '#';
  const category = product.Category || 'Category';
  const price = product.Price ? formatCurrency(parseFloat(product.Price.replace(/[^0-9.]/g, ''))) : 'Price not available';

  return (
    <Card className="overflow-hidden h-full flex flex-col group border shadow-sm hover:shadow-md transition-shadow duration-300">
      <Link href={detailPageUrl} target="_blank" rel="noopener noreferrer" className="block aspect-square relative overflow-hidden">
        <Image
          src={imageUrl} // Use the validated or fallback URL
          alt={productTitle}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
          className="object-contain group-hover:scale-105 transition-transform duration-300 p-2"
          data-ai-hint="product image"
          onError={(e) => {
            // Optional: Handle image loading errors, e.g., set to fallback
            console.error(`Failed to load image: ${imageUrl}`);
            // Fallback to placeholder if the validated URL still fails to load
            (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/productplaceholder/200/200';
          }}
        />
      </Link>
      <CardContent className="p-3 flex flex-col flex-grow justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{category}</p>
          <h3 className="text-sm font-medium leading-snug mb-2 h-10 line-clamp-2">
            <Link href={detailPageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              {productTitle}
            </Link>
          </h3>
        </div>
        <div className="mt-auto">
          <p className="text-base font-semibold text-primary mb-3">
            {price}
          </p>
          <Button size="sm" className="w-full text-xs" asChild>
            <Link href={detailPageUrl} target="_blank" rel="noopener noreferrer">
              View on Amazon <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
