// src/app/blog/page.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, BookOpen } from 'lucide-react';

// Mock Blog Posts - Replace with data fetching logic
const blogPosts = [
    { id: 'b1', title: 'Top 5 Summer Fashion Trends to Follow', excerpt: 'Stay cool and stylish this summer with these must-have fashion trends...', img: 'https://picsum.photos/seed/blog1/400/250', link: '/blog/summer-trends', date: 'May 1, 2024', category: 'Fashion' },
    { id: 'b2', title: 'Maximize Your Cashback: Pro Tips for Smart Shoppers', excerpt: 'Learn the secrets to earning more cashback on your everyday online shopping...', img: 'https://picsum.photos/seed/blog2/400/250', link: '/blog/cashback-tips', date: 'April 28, 2024', category: 'Tips & Tricks' },
    { id: 'b3', title: 'Upcoming Festival Sales: What to Expect and How to Save', excerpt: 'Get ready for the biggest sales of the season. Here’s a sneak peek at the expected deals...', img: 'https://picsum.photos/seed/blog3/400/250', link: '/blog/festival-sales', date: 'April 25, 2024', category: 'Sales & Offers' },
    { id: 'b4', title: 'The Ultimate Guide to Choosing the Right Laptop', excerpt: 'Confused about which laptop to buy? Our comprehensive guide helps you decide...', img: 'https://picsum.photos/seed/blog4/400/250', link: '/blog/laptop-guide', date: 'April 20, 2024', category: 'Electronics' },
     { id: 'b5', title: 'Travel Smart: Save Money on Your Next Vacation', excerpt: 'Discover hacks and tricks to book flights and hotels without breaking the bank...', img: 'https://picsum.photos/seed/blog5/400/250', link: '/blog/travel-savings', date: 'April 15, 2024', category: 'Travel' },
];

export default function BlogPage() {
  // Add state for loading and error handling if fetching data dynamically
  const [loading, setLoading] = React.useState(false); // Set to true if fetching
  const [error, setError] = React.useState<string | null>(null);

  // useEffect hook for data fetching would go here if needed

  return (
    <div className="space-y-8 md:space-y-12">
      <section className="text-center pt-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center justify-center gap-2">
           <BookOpen className="w-8 h-8" /> CashEase Blog
        </h1>
        <p className="text-lg text-muted-foreground">Shopping tips, guides, news, and more.</p>
      </section>

      {/* Add error handling display here if needed */}
      {error && <p className="text-red-500 text-center">Error: {error}</p>}

      <section>
        {loading ? (
          // Skeleton Loading State
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {[...Array(6)].map((_, index) => (
               <Card key={index} className="overflow-hidden">
                  <Skeleton className="aspect-[16/9] w-full bg-muted/80" />
                  <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-5 w-3/4 bg-muted/80" />
                      <Skeleton className="h-4 w-full bg-muted/80" />
                       <Skeleton className="h-4 w-2/3 bg-muted/80" />
                  </CardContent>
                   <CardFooter className="p-4 pt-0">
                       <Skeleton className="h-6 w-24 bg-muted/80" />
                   </CardFooter>
               </Card>
            ))}
          </div>
        ) : (
          // Display Blog Posts
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {blogPosts.map((post) => (
               <Card key={post.id} className="group flex flex-col overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-border rounded-lg">
                   <Link href={post.link} className="block overflow-hidden">
                       <Image data-ai-hint={`blog post ${post.title}`} src={post.img} alt={post.title} width={400} height={250} className="object-cover aspect-[16/9] w-full group-hover:scale-105 transition-transform duration-300" />
                   </Link>
                   <CardContent className="p-4 flex-grow">
                       <p className="text-xs text-muted-foreground mb-1">{post.date} • {post.category}</p>
                       <Link href={post.link}>
                          <CardTitle className="text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">{post.title}</CardTitle>
                       </Link>
                       <CardDescription className="text-sm line-clamp-3">{post.excerpt}</CardDescription>
                    </CardContent>
                    <CardFooter className="p-4 pt-0">
                        <Button variant="link" asChild className="p-0 h-auto text-primary">
                           <Link href={post.link}>Read More <ArrowRight className="ml-1 h-4 w-4" /></Link>
                        </Button>
                    </CardFooter>
                </Card>
            ))}
          </div>
        )}
        {/* Add Pagination if needed */}
      </section>
    </div>
  );
}
