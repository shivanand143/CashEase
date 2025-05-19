
"use client";

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, BookOpen, ArrowRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation'; // Import useSearchParams

// Placeholder data - replace with actual data fetching from Firestore or CMS
const placeholderPosts = [
  { id: '1', title: 'Top 5 Fashion Deals This Week', excerpt: 'Grab the latest trends at unbeatable prices with cashback...', imageUrl: 'https://picsum.photos/seed/fashionblog/400/250', date: '2024-05-28', slug: 'top-5-fashion-deals' },
  { id: '2', title: 'How to Maximize Cashback on Electronics', excerpt: 'Tips and tricks to get the most rewards on gadgets...', imageUrl: 'https://picsum.photos/seed/electronicsblog/400/250', date: '2024-05-25', slug: 'maximize-cashback-electronics' },
  { id: '3', title: 'Planning Your Next Trip? Save with Travel Offers', excerpt: 'Discover amazing deals on flights and hotels...', imageUrl: 'https://picsum.photos/seed/travelblog/400/250', date: '2024-05-22', slug: 'save-on-travel' },
  { id: '4', title: 'Understanding Cashback Tracking', excerpt: 'Learn how cashback works behind the scenes...', imageUrl: 'https://picsum.photos/seed/trackingblog/400/250', date: '2024-05-20', slug: 'cashback-tracking-explained' },
];

export default function BlogPage() {
  const [posts, setPosts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const searchParams = useSearchParams(); // Use the hook

  // Example of using searchParams if you plan to filter blog posts
  // const categoryFilter = searchParams.get('category');
  // React.useEffect(() => {
  //   if (categoryFilter) {
  //     console.log("Filtering blog posts by category:", categoryFilter);
  //     // Add filtering logic here
  //   }
  // }, [categoryFilter]);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Simulate fetching data
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
        setPosts(placeholderPosts);
      } catch (err) {
        console.error("Error fetching blog posts:", err);
        setError("Failed to load blog posts.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    // This could be a more detailed skeleton specific to the blog list
    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <BookOpen className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-3xl md:text-4xl font-bold">MagicSaver Blog</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Loading awesome content...</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="overflow-hidden animate-pulse">
                        <div className="h-48 w-full bg-muted"></div>
                        <CardHeader>
                            <div className="h-6 w-3/4 mb-2 bg-muted rounded"></div>
                            <div className="h-4 w-full bg-muted rounded"></div>
                            <div className="h-4 w-1/2 bg-muted rounded mt-1"></div>
                        </CardHeader>
                        <CardFooter>
                            <div className="h-8 w-24 bg-muted rounded"></div>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-center flex items-center justify-center gap-2">
        <BookOpen className="w-8 h-8 text-primary" /> MagicSaver Blog
      </h1>
      <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
        Stay updated with the latest deals, saving tips, and news from MagicSaver.
      </p>

      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Posts</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {posts.length === 0 && !error && !loading ? (
         <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-lg">
            <p className="text-xl">No blog posts found.</p>
            <p className="mt-2">Check back soon for updates!</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Card key={post.id} className="flex flex-col overflow-hidden group hover:shadow-lg transition-shadow duration-300">
               <Link href={`/blog/${post.slug}`} className="block aspect-[16/10] overflow-hidden">
                 <Image
                   src={post.imageUrl || 'https://placehold.co/400x250.png'}
                   alt={post.title}
                   width={400}
                   height={250}
                   className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                   data-ai-hint="blog post article image"
                 />
               </Link>
              <CardHeader className="flex-grow">
                <CardTitle className="text-lg mb-1 leading-snug">
                  <Link href={`/blog/${post.slug}`} className="hover:text-primary transition-colors">
                     {post.title}
                  </Link>
                </CardTitle>
                <CardDescription className="text-sm line-clamp-3">{post.excerpt}</CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-between items-center text-xs text-muted-foreground border-t pt-3 pb-3 px-4">
                 <span>{new Date(post.date).toLocaleDateString()}</span>
                 <Button variant="link" size="sm" asChild className="p-0 h-auto text-primary">
                     <Link href={`/blog/${post.slug}`}>Read More <ArrowRight className="ml-1 h-3 w-3" /></Link>
                 </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
