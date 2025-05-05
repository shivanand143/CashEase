
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

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card className="overflow-hidden h-full flex flex-col group border shadow-sm hover:shadow-md transition-shadow duration-300">
      <Link href={product.DetailPageURL || '#'} target="_blank" rel="noopener noreferrer" className="block aspect-square relative overflow-hidden">
        <Image
          src={product.ImageURL || 'https://picsum.photos/seed/productplaceholder/200/200'}
          alt={product.Title || 'Product Image'}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
          className="object-contain group-hover:scale-105 transition-transform duration-300 p-2" // Use object-contain for product images
          data-ai-hint="product image"
        />
      </Link>
      <CardContent className="p-3 flex flex-col flex-grow justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{product.Category || 'Category'}</p>
          <h3 className="text-sm font-medium leading-snug mb-2 h-10 line-clamp-2">
            <Link href={product.DetailPageURL || '#'} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              {product.Title || 'Product Title'}
            </Link>
          </h3>
        </div>
        <div className="mt-auto">
          <p className="text-base font-semibold text-primary mb-3">
            {product.Price ? formatCurrency(parseFloat(product.Price.replace(/[^0-9.]/g, ''))) : 'Price not available'}
          </p>
          <Button size="sm" className="w-full text-xs" asChild>
            <Link href={product.DetailPageURL || '#'} target="_blank" rel="noopener noreferrer">
              View on Amazon <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
