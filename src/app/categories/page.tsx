"use client";

import * as React from 'react';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Category } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, List } from 'lucide-react';

export default function CategoriesPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError(null);
      if (!db) {
         setError("Database connection not available.");
         setLoading(false);
         return;
      }
      try {
        const categoriesCollection = collection(db, 'categories');
        // Fetch active categories, ordered by 'order' field, then 'name'
        const q = query(
            categoriesCollection,
            // where('isActive', '==', true), // Add this if you have an 'isActive' field
            orderBy('order', 'asc'),
            orderBy('name', 'asc')
        );
        const querySnapshot = await getDocs(q);
        const fetchedCategories = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as Category));
        setCategories(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories:", err);
        setError(err instanceof Error ? err.message : "Failed to load categories.");
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <List className="w-8 h-8 text-primary" /> Browse Categories
      </h1>
       <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
          Discover cashback offers and deals by exploring different shopping categories.
       </p>

      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Categories</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : categories.length === 0 ? (
         <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg">
            <p className="text-xl">No categories found.</p>
            <p className="mt-2">Please check back later or contact support if you believe this is an error.</p>
         </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {categories.map((category) => (
            <Link key={category.id} href={`/category/${category.slug}`} legacyBehavior>
              <a className="block group">
                <Card className="overflow-hidden text-center hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
                  <CardContent className="p-4 flex-grow flex flex-col items-center justify-center bg-muted/50 group-hover:bg-muted/80 transition-colors">
                    {category.imageUrl ? (
                      <Image
                        src={category.imageUrl}
                        alt={`${category.name} category`}
                        width={80}
                        height={80}
                        className="object-contain mb-3 h-20 w-20 rounded-full border bg-background p-1"
                        data-ai-hint={`${category.name} icon illustration`}
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full flex items-center justify-center mb-3 border text-primary">
                        <List className="w-10 h-10" />
                      </div>
                    )}
                    <p className="font-semibold text-sm text-foreground">{category.name}</p>
                    {category.description && (
                       <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{category.description}</p>
                    )}
                  </CardContent>
                </Card>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
