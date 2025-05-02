// src/app/page.tsx
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Tag, Store as StoreIcon } from 'lucide-react';

// Mock data for demonstration - replace with actual data fetching
const featuredStores = [
  { id: '1', name: 'Amazon', logoUrl: 'https://picsum.photos/seed/amazon/100/50', cashbackRate: 'Up to 3%', dataAiHint: "amazon logo" },
  { id: '2', name: 'Walmart', logoUrl: 'https://picsum.photos/seed/walmart/100/50', cashbackRate: 'Up to 2%', dataAiHint: "walmart logo" },
  { id: '3', name: 'Target', logoUrl: 'https://picsum.photos/seed/target/100/50', cashbackRate: '1.5% Cashback', dataAiHint: "target logo"},
  { id: '4', name: 'Best Buy', logoUrl: 'https://picsum.photos/seed/bestbuy/100/50', cashbackRate: 'Up to 4%', dataAiHint: "best buy logo"},
];

const featuredCoupons = [
  { id: 'c1', storeId: '1', storeName: 'Amazon', description: '10% off Select Electronics', code: 'AMZ10', link: '/coupon/c1' },
  { id: 'c2', storeId: '4', storeName: 'Best Buy', description: '$20 off Orders over $100', code: 'BBDEAL20', link: '/coupon/c2' },
  { id: 'c3', storeId: '2', storeName: 'Walmart', description: 'Free Shipping on $35+', link: '/coupon/c3' },
];

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-16 bg-gradient-to-r from-primary/10 via-background to-secondary/10 rounded-lg shadow-sm">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
          Shop Smarter, Earn <span className="text-primary">CashEase</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Get real cashback and find the best coupons for thousands of online stores. Join free today!
        </p>
        <div className="space-x-4">
          <Button size="lg" asChild>
            <Link href="/signup">Get Started for Free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/stores">Browse Stores</Link>
          </Button>
        </div>
      </section>

      {/* How it Works Section */}
      <section>
        <h2 className="text-3xl font-bold text-center mb-8">How CashEase Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><span className="text-primary font-bold text-4xl">1</span> Find Your Store</CardTitle>
              <CardDescription>Browse thousands of stores or search for your favorite one.</CardDescription>
            </CardHeader>
            <CardContent>
              <Image data-ai-hint="online shopping store search" src="https://picsum.photos/seed/step1/400/200" alt="Find Store" width={400} height={200} className="rounded-md object-cover" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><span className="text-primary font-bold text-4xl">2</span> Shop as Usual</CardTitle>
              <CardDescription>Click the link on CashEase and shop directly on the store's site.</CardDescription>
            </CardHeader>
            <CardContent>
              <Image data-ai-hint="person shopping online laptop" src="https://picsum.photos/seed/step2/400/200" alt="Shop" width={400} height={200} className="rounded-md object-cover" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
               <CardTitle className="flex items-center gap-2"><span className="text-primary font-bold text-4xl">3</span> Earn Cashback</CardTitle>
              <CardDescription>Your cashback tracks automatically and gets added to your CashEase account.</CardDescription>
            </CardHeader>
             <CardContent>
               <Image data-ai-hint="money cashback reward illustration" src="https://picsum.photos/seed/step3/400/200" alt="Earn Cashback" width={400} height={200} className="rounded-md object-cover" />
             </CardContent>
          </Card>
        </div>
      </section>

      {/* Featured Stores Section */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Featured Stores</h2>
          <Button variant="link" asChild>
            <Link href="/stores">View All Stores <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {featuredStores.map((store) => (
            <Card key={store.id} className="flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
               <CardContent className="p-4 flex flex-col items-center">
                 <Image data-ai-hint={store.dataAiHint} src={store.logoUrl} alt={`${store.name} Logo`} width={100} height={50} className="object-contain mb-2 h-[50px]" />
                <p className="font-semibold">{store.name}</p>
                <p className="text-sm text-primary font-medium">{store.cashbackRate}</p>
               </CardContent>
               <CardFooter className="p-2 w-full">
                 <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`/stores/${store.id}`}>Shop Now</Link>
                 </Button>
               </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* Featured Coupons Section */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Top Coupons</h2>
          <Button variant="link" asChild>
            <Link href="/coupons">View All Coupons <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {featuredCoupons.map((coupon) => (
            <Card key={coupon.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Tag className="w-5 h-5 text-secondary"/> {coupon.storeName}</CardTitle>
                <CardDescription>{coupon.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                 {coupon.code ? (
                   <Button variant="outline" className="w-full justify-between border-dashed border-accent text-accent hover:bg-accent/10 hover:text-accent">
                    <span>{coupon.code}</span>
                    <span>Copy Code</span>
                   </Button>
                 ) : (
                   <Button className="w-full bg-secondary hover:bg-secondary/90" asChild>
                     <Link href={coupon.link}>Get Deal</Link>
                   </Button>
                 )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
