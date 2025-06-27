
"use client";

import * as React from 'react';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Category } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { safeToDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
const CATEGORIES_PER_PAGE = 18; // Adjust as needed

export default function CategoriesPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      if (firebaseInitializationError) {
        if (isMounted) setError(`Database initialization failed: ${firebaseInitializationError}`);
        setLoading(false);
        return;
      }
      if (!db) {
        if (isMounted) setError("Database connection not available.");
        setLoading(false);
        return;
      }

      try {
        const categoriesCollection = collection(db, 'categories');
        const q = query(
          categoriesCollection,
          where('isActive', '==', true),
          orderBy('order', 'asc'),
          orderBy('name', 'asc'),
          limit(CATEGORIES_PER_PAGE * 2) // Fetch a bit more to see if there's more for pagination later if needed
        );
        const querySnapshot = await getDocs(q);
        const fetchedCategories = querySnapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || '',
            slug: data.slug || '',
            order: data.order ?? 0,
            isActive: data.isActive ?? true,
            imageUrl: data.imageUrl || '',
            description: data.description || '',
            dataAiHint: data.dataAiHint || '',
            createdAt: data.createdAt as Timestamp,
            updatedAt: data.updatedAt as Timestamp,
          } satisfies Category;
        });
        
        if (isMounted) setCategories(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories:", err);
        if (isMounted) {
          const errorMsg = err instanceof Error ? err.message : "Failed to load categories.";
          setError(errorMsg);
          toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCategories();
    return () => { isMounted = false; };
  }, [toast]);

  if (loading) {
    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <List className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-3xl md:text-4xl font-bold">All Categories</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Loading categories...</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {Array.from({ length: 12 }).map((_, index) => (
                <Skeleton key={`cat-skel-${index}`} className="h-36 rounded-lg" />
                ))}
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2 flex items-center justify-center gap-3">
          <List className="w-10 h-10 text-primary" /> All Categories
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Explore a wide range of categories to find exactly what you're looking for.
        </p>
      </section>

      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Categories</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && categories.length === 0 && !error && (
        <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg border">
          <p className="text-xl mb-4">No categories found.</p>
          <p>Please check back later as we're always adding new shopping options!</p>
        </div>
      )}

      {categories.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {categories.map((category) => (
            <Link key={category.id} href={`/category/${category.slug}`} className="block group">
              <Card className="flex flex-col items-center text-center p-3 hover:shadow-xl transition-shadow duration-300 h-full bg-card hover:bg-primary/5 border-transparent hover:border-primary/30 rounded-lg">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-3 overflow-hidden border-2 border-primary/20 group-hover:border-primary transition-all duration-300 group-hover:scale-105">
                  {category.imageUrl ? (
                    <Image
                      src={category.imageUrl}
                      alt={category.name}
                      width={80}
                      height={80}
                      className="object-contain p-2"
                      data-ai-hint={category.dataAiHint || "category icon"}
                      onError={(e) => ((e.target as HTMLImageElement).src = 'https://placehold.co/80x80.png')}
                    />
                  ) : (
                    <List className="w-10 h-10 text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm font-semibold group-hover:text-primary transition-colors leading-tight">
                  {category.name}
                </p>
                {category.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{category.description}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
      {/* Add pagination or "Load More" button here if categories > CATEGORIES_PER_PAGE * 2 */}
    </div>
  );
}
