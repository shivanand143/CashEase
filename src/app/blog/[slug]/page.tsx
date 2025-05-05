"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowLeft, CalendarDays, UserCircle } from 'lucide-react';

// Placeholder data - replace with actual data fetching
const getPlaceholderPost = (slug: string) => {
    if (slug === 'top-5-fashion-deals') {
        return { id: '1', title: 'Top 5 Fashion Deals This Week', content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam...', imageUrl: 'https://picsum.photos/seed/fashionblog/800/400', date: '2024-05-28', author: 'Jane Doe', slug: 'top-5-fashion-deals' };
    }
    // Add more placeholders or default
    return { id: 'default', title: 'Blog Post Not Found', content: 'The requested blog post could not be found.', imageUrl: null, date: new Date().toISOString(), author: 'System', slug: slug };
};

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();

  const [post, setPost] = React.useState<any>(null); // Use actual Post type later
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!slug || typeof slug !== 'string') {
      setError("Invalid blog post identifier.");
      setLoading(false);
      return;
    }

    const fetchPost = async () => {
      setLoading(true);
      setError(null);
      try {
        // Replace with actual fetch logic (e.g., from Firestore using the slug)
        await new Promise(resolve => setTimeout(resolve, 300)); // Simulate delay
        const fetchedPost = getPlaceholderPost(slug);
        if (fetchedPost.id === 'default') {
             setError("Blog post not found.");
             setPost(null);
        } else {
            setPost(fetchedPost);
        }
      } catch (err) {
        console.error("Error fetching blog post:", err);
        setError("Failed to load blog post.");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  if (loading) {
    return <BlogPostSkeleton />;
  }

  if (error || !post) {
    return (
      <div className="container mx-auto max-w-3xl text-center py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{error ? "Error" : "Not Found"}</AlertTitle>
          <AlertDescription>{error || "The blog post you're looking for doesn't exist."}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-6" onClick={() => router.push('/blog')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blog
        </Button>
      </div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

      {post.imageUrl && (
        <div className="relative aspect-video overflow-hidden rounded-lg shadow-md mb-6">
          <Image
            src={post.imageUrl}
            alt={post.title}
            fill
            className="object-cover"
            priority // Prioritize loading the main image
            data-ai-hint="blog post hero image"
          />
        </div>
      )}

      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">{post.title}</h1>
        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <UserCircle className="w-4 h-4" />
            <span>{post.author || 'CashEase Team'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" />
            <span>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
      </header>

      {/* Post Content */}
      <div className="prose prose-lg dark:prose-invert max-w-none">
        {/* Render actual post content here (e.g., from markdown or rich text editor) */}
        <p>{post.content}</p>
        {/* Add more paragraphs, images, etc. based on your content structure */}
         <p>Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec velit neque, auctor sit amet aliquam vel, ullamcorper sit amet ligula. Curabitur aliquet quam id dui posuere blandit.</p>
         <h2>Subheading Example</h2>
         <p>Nulla porttitor accumsan tincidunt. Vivamus suscipit tortor eget felis porttitor volutpat. Curabitur arcu erat, accumsan id imperdiet et, porttitor at sem.</p>
      </div>

       <Button variant="outline" onClick={() => router.push('/blog')} className="mt-8">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blog
       </Button>
    </article>
  );
}

// Skeleton Loader Component
function BlogPostSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Skeleton className="h-8 w-24 mb-6" /> {/* Back button */}
      <Skeleton className="aspect-video w-full rounded-lg mb-6" /> {/* Image */}
      <div className="space-y-3">
        <Skeleton className="h-10 w-3/4" /> {/* Title */}
        <div className="flex space-x-4">
            <Skeleton className="h-4 w-24" /> {/* Author */}
            <Skeleton className="h-4 w-32" /> {/* Date */}
        </div>
      </div>
      <div className="space-y-4 mt-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
