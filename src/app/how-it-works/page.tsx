"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Search, ShoppingBag, IndianRupee, Gift, Banknote, MousePointerClick, CheckCircle } from 'lucide-react'; // Updated CheckCircle for confirmation
import Image from 'next/image';

const steps = [
  {
    icon: Search,
    title: "1. Find Your Store or Deal",
    description: "Search for your favorite online store (like Amazon, Myntra, Flipkart) or browse through thousands of deals and coupons listed on CashEase.",
    image: "https://picsum.photos/seed/hiw-find/400/250",
    aiHint: "searching online store on computer illustration",
  },
  {
    icon: MousePointerClick,
    title: "2. Click Out via CashEase",
    description: "Once you find a store or deal you like, simply click the 'Activate Cashback' or 'Get Deal' button. This click is crucial for tracking your potential cashback.",
    image: "https://picsum.photos/seed/hiw-click/400/250",
    aiHint: "clicking button on website illustration",
  },
  {
    icon: ShoppingBag,
    title: "3. Shop As Usual",
    description: "You'll land on the retailer's site (e.g., Amazon.in). Shop normally, add items to your cart, and complete your purchase directly on their website.",
    image: "https://picsum.photos/seed/hiw-shop/400/250",
    aiHint: "online shopping cart checkout illustration",
  },
  {
    icon: IndianRupee, // Keep IndianRupee for earnings, but update text
    title: "4. Cashback Tracking Initiated",
    description: "Your click through CashEase is recorded. Based on this click and information we receive (or you provide), your potential cashback will appear as 'Pending' within 72 hours.", // Updated description
    image: "https://picsum.photos/seed/hiw-track/400/250",
    aiHint: "tracking earnings graph chart illustration",
  },
   {
    icon: CheckCircle, // Use CheckCircle for confirmation
    title: "5. Cashback Confirmed",
    description: "After the retailer's return period (usually 30-90 days), we verify your purchase. Once confirmed, your cashback status changes from 'Pending' to 'Confirmed'.",
    image: "https://picsum.photos/seed/hiw-confirm/400/250",
    aiHint: "approved confirmed checkmark illustration",
  },
  {
    icon: Banknote,
    title: "6. Withdraw Your Earnings",
    description: "Once you have ₹250 or more in 'Confirmed' cashback, you can withdraw it to your bank account via NEFT/UPI or redeem it as Amazon/Flipkart gift cards.",
    image: "https://picsum.photos/seed/hiw-withdraw/400/250",
    aiHint: "withdrawing money bank transfer illustration",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="space-y-12">
      <section className="text-center">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">How CashEase Works</h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
          Earning cashback on your online shopping is simple! Follow these easy steps to start saving.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
        {steps.map((step, index) => (
          <Card key={index} className="flex flex-col text-center shadow-sm hover:shadow-lg transition-shadow duration-300 border border-border/50">
            <CardHeader className="items-center">
               <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4">
                 <step.icon className="w-8 h-8" />
               </div>
              <CardTitle className="text-xl font-semibold">{step.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col items-center">
               {step.image && (
                 <div className="mb-4 aspect-[16/10] w-full max-w-xs overflow-hidden rounded-md">
                    <Image
                        src={step.image}
                        alt={step.title}
                        width={400}
                        height={250}
                        className="object-cover w-full h-full"
                        data-ai-hint={step.aiHint}
                    />
                 </div>
               )}
              <p className="text-muted-foreground text-sm">{step.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="text-center py-10 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg border border-border/30 shadow-sm">
         <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Start Saving?</h2>
         <p className="text-muted-foreground mb-6 max-w-xl mx-auto">Join thousands of shoppers earning real cashback on every purchase.</p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
           <Button size="lg" asChild>
             <Link href="/signup">Join CashEase for Free</Link>
           </Button>
            <Button size="lg" variant="outline" asChild>
             <Link href="/stores">Browse Stores Now</Link>
           </Button>
        </div>
      </section>
    </div>
  );
}
