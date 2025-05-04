// src/app/blog/[slug]/page.tsx
"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft, CalendarDays, User } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const getMockPost = (slug: string) => {
  const posts = [
      { slug: 'summer-trends', title: 'Top 5 Summer Fashion Trends to Follow', content: '<p>Stay cool and stylish this summer with these must-have fashion trends...</p><p><strong>1. Linen Everything:</strong> Breathable and effortlessly chic.</p><p><strong>2. Bright Colors:</strong> Dopamine dressing is in!</p><p><em>More content here...</em></p>', img: 'https://picsum.photos/seed/blog1/800/400', date: 'May 1, 2024', author: 'CashEase Editor', category: 'Fashion' },
      { slug: 'cashback-tips', title: 'Maximize Your Cashback: Pro Tips for Smart Shoppers', content: '<p>Learn the secrets to earning more cashback...</p><ul><li>Always start your shopping journey from CashEase.</li><li>Check for coupon codes in addition to cashback.</li></ul>', img: 'https://picsum.photos/seed/blog2/800/400', date: 'April 28, 2024', author: 'CashEase Team', category: 'Tips & Tricks' },
      { slug: 'festival-sales', title: 'Upcoming Festival Sales: What to Expect and How to Save', content: '<p>Get ready for the biggest sales...</p>', img: 'https://picsum.photos/seed/blog3/800/400', date: 'April 25, 2024', author: 'Guest Writer', category: 'Sales & Offers' },
      { slug: 'laptop-guide', title: 'The Ultimate Guide to Choosing the Right Laptop', content: '<p>Confused about which laptop to buy? Our comprehensive guide helps you decide...</p>', img: 'https://picsum.photos/seed/blog4/800/400', date: 'April 20, 2024', author: 'Tech Expert', category: 'Electronics' },
      { slug: 'travel-savings', title: 'Travel Smart: Save Money on Your Next Vacation', content: '<p>Discover hacks and tricks to book flights and hotels without breaking the bank...</p>', img: 'https://picsum.photos/seed/blog5/800/400', date: 'April 15, 2024', author: 'Travel Guru', category: 'Travel' },
  ];
  return posts.find(p => p.slug === slug);
};

export default function BlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [post, setPost] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchPost = async () => {
      if (!slug) return;
      setLoading(true);
      setError(null);
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        const fetchedPost = getMockPost(slug);

        if (fetchedPost) {
          setPost(fetchedPost);
        } else {
          setError("Blog post not found.");
        }
      } catch (err) {
        console.error("Error fetching blog post:", err);
        setError("Failed to load blog post. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return (
        // Wrap skeleton in container
        <div className="container py-8">
           <BlogPostSkeleton />
        </div>
    );
  }

  if (error) {
    return (
      // Wrap error in container
      <div className="container py-8">
        <div className="space-y-4 max-w-3xl mx-auto text-center py-10">
          <Button variant="outline" onClick={() => router.back()} size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blog
          </Button>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      // Wrap fallback in container
      <div className="container py-8">
        <div className="space-y-4 max-w-3xl mx-auto text-center py-10">
          <Button variant="outline" onClick={() => router.back()} size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blog
          </Button>
          <p>Blog post not found.</p>
        </div>
      </div>
    )
  }

  return (
    // Wrap article in container
    <div className="container py-8">
      <article className="max-w-3xl mx-auto py-8 md:py-12">
        <Button variant="outline" onClick={() => router.back()} size="sm" className="mb-6 inline-flex items-center">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blog
        </Button>

        <header className="mb-8">
          <Badge variant="secondary" className="mb-2">{post.category}</Badge>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold leading-tight mb-3">
            {post.title}
          </h1>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" />
              <span>{post.date}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              <span>By {post.author}</span>
            </div>
          </div>
        </header>

        {post.img && (
          <Image
            data-ai-hint={`blog post featured image ${post.title}`}
            src={post.img}
            alt={post.title}
            width={800}
            height={400}
            className="w-full h-auto rounded-lg shadow-md mb-8 object-cover aspect-[16/8]"
            priority
          />
        )}

        <Separator className="my-8" />

        <div
          className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary hover:prose-a:underline prose-img:rounded-md"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <Separator className="my-8" />

        <div className="text-center">
          <p className="text-muted-foreground">Enjoyed this post? Share it!</p>
          {/* Add social sharing buttons */}
        </div>

      </article>
    </div>
  );
}

function BlogPostSkeleton() {
  return (
    <div className="max-w-3xl mx-auto py-8 md:py-12 space-y-8 animate-pulse">
      <Skeleton className="h-8 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-3/4" />
        <div className="flex space-x-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="w-full aspect-[16/8] rounded-lg" />
      <Separator className="my-8" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    </div>
  );
}
