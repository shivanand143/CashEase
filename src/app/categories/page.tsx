// src/app/categories/page.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { List } from 'lucide-react';

const categories = [
    { name: 'Fashion', icon: '👗', slug: 'fashion', description: 'Latest trends in clothing, shoes, and accessories.' },
    { name: 'Electronics', icon: '💻', slug: 'electronics', description: 'Find deals on mobiles, laptops, gadgets, and more.' },
    { 'name': 'Travel', icon: '✈️', slug: 'travel', description: 'Book flights, hotels, and packages.' },
    { 'name': 'Grocery', icon: '🛒', slug: 'grocery', description: 'Shop daily essentials and groceries online.' },
    { 'name': 'Beauty', icon: '💄', slug: 'beauty', description: 'Makeup, skincare, and personal care products.' },
    { 'name': 'Home & Kitchen', icon: '🏠', slug: 'home', description: 'Furniture, decor, appliances, and kitchenware.' },
    { 'name': 'Recharge', icon: '📱', slug: 'recharge', description: 'Mobile, DTH recharges and bill payments.' },
    { 'name': 'Food', icon: '🍕', slug: 'food', description: 'Order food online from your favorite restaurants.' },
    { 'name': 'Health', icon: '💊', slug: 'health', description: 'Medicines, health products, and online consultations.' },
    { 'name': 'Gifts', icon: '🎁', slug: 'gifts', description: 'Find the perfect gift for any occasion.' },
];


export default function CategoriesPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    // Removed container div
    <div className="py-8">
      <div className="space-y-8 md:space-y-12">
        <section className="text-center pt-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center justify-center gap-2">
            <List className="w-8 h-8" /> Shop by Category
          </h1>
          <p className="text-lg text-muted-foreground">Discover cashback offers across various categories.</p>
        </section>

        {error && <p className="text-red-500 text-center">Error: {error}</p>}

        <section>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {[...Array(10)].map((_, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardContent className="p-6 flex flex-col items-center justify-center aspect-square">
                    <Skeleton className="h-12 w-12 rounded-full mb-4 bg-muted/80" />
                    <Skeleton className="h-5 w-3/4 mb-2 bg-muted/80" />
                    <Skeleton className="h-3 w-full bg-muted/80" />
                    <Skeleton className="h-3 w-2/3 bg-muted/80" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {categories.map((category) => (
                <Link key={category.slug} href={`/category/${category.slug}`} className="group block">
                  <Card className="text-center hover:shadow-xl transition-shadow duration-300 border border-border rounded-lg overflow-hidden aspect-square flex flex-col items-center justify-center p-6 bg-card hover:bg-muted/50">
                    <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">{category.icon}</span>
                    <p className="font-semibold text-lg mb-1 group-hover:text-primary">{category.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{category.description}</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
