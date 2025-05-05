
import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function HomePage() {
  return (
    <div className="space-y-12 md:space-y-16">
      {/* Hero Section */}
      <section className="text-center py-16 md:py-24 bg-gradient-to-br from-primary/10 via-background to-secondary/10 rounded-lg shadow-sm overflow-hidden">
         <div className="container px-4 md:px-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-foreground">
               Shop Smarter, Earn <span className="text-primary">CashEase</span> Back!
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
               Get real cashback and find the best coupons for your online stores in India. Join free today!
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="relative mb-8 max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
              <Input
                type="search"
                placeholder="Search Stores & Offers (e.g., Amazon, Flipkart...)"
                className="pl-12 pr-24 py-3 w-full h-14 text-lg rounded-full shadow-md focus:ring-2 focus:ring-primary focus:border-primary"
                aria-label="Search stores and offers"
              />
              <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-4 rounded-full">Search</Button>
            </form>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
               <Button size="lg" asChild className="w-full sm:w-auto shadow-md hover:shadow-lg transition-shadow">
                  <Link href="/signup">Join Free & Start Earning</Link>
               </Button>
               <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                  <Link href="/stores">Browse All Stores</Link>
               </Button>
            </div>
         </div>
      </section>

       {/* How it Works Section */}
       <section className="container px-4 md:px-6">
          <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {/* Step 1 */}
             <Card className="text-center">
               <CardHeader>
                  <CardTitle className="flex flex-col items-center gap-2">
                     <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-2xl mb-2">1</span>
                     Find Your Store
                  </CardTitle>
               </CardHeader>
               <CardContent>
                  <CardDescription>Browse thousands of stores or search for your favorite one.</CardDescription>
               </CardContent>
             </Card>
             {/* Step 2 */}
              <Card className="text-center">
                <CardHeader>
                   <CardTitle className="flex flex-col items-center gap-2">
                      <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-2xl mb-2">2</span>
                      Shop as Usual
                   </CardTitle>
                </CardHeader>
                <CardContent>
                   <CardDescription>Click the link on CashEase and shop directly on the store's site.</CardDescription>
                </CardContent>
              </Card>
              {/* Step 3 */}
               <Card className="text-center">
                 <CardHeader>
                    <CardTitle className="flex flex-col items-center gap-2">
                       <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-2xl mb-2">3</span>
                       Earn Cashback
                    </CardTitle>
                 </CardHeader>
                 <CardContent>
                    <CardDescription>Your cashback tracks automatically and gets added to your CashEase account.</CardDescription>
                 </CardContent>
               </Card>
          </div>
       </section>

      {/* Placeholder Sections */}
      <section className="container px-4 md:px-6">
        <h2 className="text-2xl font-semibold mb-4">Featured Stores</h2>
        <p className="text-muted-foreground">Featured stores section coming soon...</p>
        {/* Add Store Cards here later */}
      </section>

      <section className="container px-4 md:px-6">
        <h2 className="text-2xl font-semibold mb-4">Top Coupons</h2>
        <p className="text-muted-foreground">Top coupons section coming soon...</p>
        {/* Add Coupon Cards here later */}
      </section>
    </div>
  );
}
