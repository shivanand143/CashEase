
"use client";
import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingBag, MousePointerClick, Percent, Gift, IndianRupee, ArrowRight, CheckCircle, Search, Users, Award } from 'lucide-react';


export const dynamic = 'force-dynamic';
export default function HowItWorksPage() {
  const steps = [
    {
      step: 1,
      title: "Sign Up / Log In",
      description: "Create your free MagicSaver account or log in to start your savings journey.",
      icon: Users,
      imageUrl: "https://placehold.co/400x250.png?text=Sign+Up",
      dataAiHint: "user registration form"
    },
    {
      step: 2,
      title: "Browse Stores & Offers",
      description: "Explore thousands of partner stores and discover exclusive cashback deals, coupons, and offers.",
      icon: Search,
      imageUrl: "https://placehold.co/400x250.png?text=Browse+Deals",
      dataAiHint: "online shopping browse"
    },
    {
      step: 3,
      title: "Click Through & Shop",
      description: "Click on your chosen deal. We'll redirect you to the retailer's website. Shop as you normally would.",
      icon: MousePointerClick,
      imageUrl: "https://placehold.co/400x250.png?text=Click+%26+Shop",
      dataAiHint: "computer mouse click"
    },
    {
      step: 4,
      title: "Cashback Tracks Automatically",
      description: "After your purchase, cashback is automatically tracked and added to your MagicSaver account as 'Pending'.",
      icon: Percent,
      imageUrl: "https://placehold.co/400x250.png?text=Track+Cashback",
      dataAiHint: "money tracking graph"
    },
    {
      step: 5,
      title: "Cashback Confirmed",
      description: "Once the retailer confirms your purchase (usually after the return period), your cashback status changes to 'Confirmed'.",
      icon: CheckCircle,
      imageUrl: "https://placehold.co/400x250.png?text=Confirm+Cashback",
      dataAiHint: "checkmark success confirmation"
    },
    {
      step: 6,
      title: "Withdraw Your Earnings",
      description: "Transfer your confirmed cashback to your bank account or redeem it as gift cards once you reach the minimum threshold.",
      icon: IndianRupee,
      imageUrl: "https://placehold.co/400x250.png?text=Withdraw+Money",
      dataAiHint: "wallet money transfer"
    }
  ];

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      <section className="text-center">
        <Award className="w-16 h-16 text-primary mx-auto mb-4" />
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">How MagicSaver Works</h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
          Earning cashback with MagicSaver is simple! Follow these easy steps to save on every online purchase.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
        {steps.map((item) => (
          <Card key={item.step} className="flex flex-col text-center shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg overflow-hidden border-primary/20">
            <CardHeader className="items-center bg-primary/5 p-4">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground mb-3 text-2xl font-bold">
                {item.step}
              </div>
              <CardTitle className="text-xl font-semibold text-primary">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 flex-grow flex flex-col items-center">
              <div className="relative w-full aspect-[16/10] mb-4 rounded-md overflow-hidden">
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  className="object-cover"
                  data-ai-hint={item.dataAiHint}
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="text-center py-10 md:py-16 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg border border-border/30 shadow-inner">
        <Gift className="w-12 h-12 text-accent mx-auto mb-4" />
        <h2 className="text-2xl md:text-3xl font-semibold mb-4">Start Saving Today!</h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Join MagicSaver for free and unlock a world of savings. It's the smartest way to shop online.
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <Button size="lg" asChild className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-md px-8 py-3 text-base">
            <Link href="/signup">
              Sign Up Now <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="px-8 py-3 text-base">
            <Link href="/stores">
              Browse Stores <ShoppingBag className="ml-2 w-5 h-5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

