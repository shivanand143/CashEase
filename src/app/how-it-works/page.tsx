// src/app/how-it-works/page.tsx
import * as React from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card'; // Removed unused CardHeader, CardContent, CardTitle
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Search, MousePointerClick, ShoppingCart, IndianRupee, Gift } from 'lucide-react';

export default function HowItWorksPage() {
  const steps = [
    {
      step: 1,
      icon: Search,
      title: "Sign Up & Browse",
      desc: "Join CashEase for free. Explore thousands of deals, coupons, and cashback offers from your favorite online stores like Amazon, Flipkart, Myntra, and many more.",
      img: "https://picsum.photos/seed/how-step1/500/300",
      hint: "person browsing online deals laptop",
    },
    {
      step: 2,
      icon: MousePointerClick,
      title: "Click Through",
      desc: "Find a store or offer you like? Simply click the 'Shop Now' or 'Get Deal' button on CashEase. We'll redirect you to the retailer's website.",
      img: "https://picsum.photos/seed/how-step2/500/300",
      hint: "clicking button on website interface",
    },
    {
      step: 3,
      icon: ShoppingCart,
      title: "Shop As Usual",
      desc: "Once on the retailer's site, shop like you normally would. Add items to your cart and complete your purchase directly on their website.",
      img: "https://picsum.photos/seed/how-step3/500/300",
      hint: "online shopping cart checkout process",
    },
    {
      step: 4,
      icon: IndianRupee,
      title: "Earn Cashback",
      desc: "We automatically track your purchase! Your cashback will appear as 'Pending' in your CashEase account, usually within 72 hours.",
      img: "https://picsum.photos/seed/how-step4/500/300",
      hint: "money coins cashback notification",
    },
    {
      step: 5,
      icon: Gift,
      title: "Get Paid",
      desc: "Once your cashback is 'Confirmed' (after the return period) and reaches the minimum threshold (e.g., ₹250), you can withdraw it to your bank account or as gift cards!",
      img: "https://picsum.photos/seed/how-step5/500/300",
      hint: "receiving money bank transfer gift card",
    },
  ];

  return (
    // Wrap content in a container div with padding
    <div className="container py-8">
      <div className="space-y-12 py-8 md:py-16">
        <section className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-primary">
            How CashEase Works
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Earning cashback on your online shopping is simple! Follow these easy steps:
          </p>
        </section>

        <section className="px-4 md:px-6 space-y-10">
          {steps.map((item, index) => (
            <Card
              key={item.step}
              className={`overflow-hidden shadow-lg border border-border/50 flex flex-col ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
            >
              <div className="relative h-64 md:h-auto md:w-1/2">
                <Image
                  data-ai-hint={item.hint}
                  src={item.img}
                  alt={item.title}
                  layout="fill"
                  objectFit="cover"
                />
              </div>
              <div className="p-8 md:p-12 flex flex-col justify-center md:w-1/2 space-y-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-xl shrink-0">
                    {item.step}
                  </span>
                  {/* Using h3 instead of CardTitle for semantic correctness */}
                  <h3 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                    <item.icon className="w-7 h-7 text-primary shrink-0" />
                    {item.title}
                  </h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
                {item.step === 1 && (
                  <Button asChild size="sm" className="w-fit">
                    <Link href="/signup">Sign Up Free</Link>
                  </Button>
                )}
                {item.step === 5 && (
                  <Button asChild size="sm" className="w-fit">
                    <Link href="/dashboard">View My Earnings</Link>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </section>

        <section className="px-4 md:px-6 text-center bg-secondary/10 py-12 rounded-lg">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Saving?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            Join thousands of smart shoppers earning real money back on their purchases.
          </p>
          <Button size="lg" asChild className="shadow-md hover:shadow-lg transition-shadow bg-secondary hover:bg-secondary/90 text-secondary-foreground">
            <Link href="/stores">Browse Stores & Start Earning!</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
