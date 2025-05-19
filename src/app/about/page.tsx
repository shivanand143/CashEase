
"use client";

import React from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Building, Target, Users, TrendingUp, HandCoins, IndianRupee, BadgePercent } from 'lucide-react'; // Import IndianRupee and BadgePercent

export default function AboutPage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative text-center py-16 md:py-24 bg-gradient-to-b from-primary/10 via-background to-secondary/10 rounded-lg overflow-hidden border border-border/30 shadow-sm">
         <div className="container relative z-10">
             <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4">
                About <span className="text-primary">MagicSaver</span>
             </h1>
             <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
                India's Smarter Way to Shop Online & Save Money.
             </p>
         </div>
         {/* Optional: Subtle background pattern or image */}
      </section>

      {/* Our Mission */}
      <section className="container grid md:grid-cols-2 gap-10 items-center">
        <div className="order-last md:order-first">
          <h2 className="text-3xl font-bold mb-4 flex items-center gap-2"><Target className="w-7 h-7 text-primary" /> Our Mission</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            At MagicSaver, our mission is simple: to make online shopping more rewarding for everyone in India. We believe you shouldn't have to choose between getting the best deals and earning something back on your purchases.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We partner with hundreds of top online retailers to bring you exclusive cashback offers and curated coupons, ensuring you save money every time you shop through our platform. We handle the complexities of affiliate tracking so you can focus on finding the products you love.
          </p>
        </div>
        <div className="flex justify-center">
            <Image
                src="https://placehold.co/500x350.png"
                alt="Illustration of a target or mission goal"
                width={500}
                height={350}
                className="rounded-lg shadow-md"
                data-ai-hint="mission goal target illustration"
            />
        </div>
      </section>

      {/* Why Choose Us? */}
      <section className="container py-12 bg-muted/50 rounded-lg border border-border/50">
        <h2 className="text-3xl font-bold text-center mb-10">Why Choose MagicSaver?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          <div className="text-center p-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4 mx-auto">
               <IndianRupee className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Real Cashback</h3>
            <p className="text-sm text-muted-foreground">Earn actual money, not just points, transferable directly to your bank account or as gift cards.</p>
          </div>
          <div className="text-center p-4">
             <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4 mx-auto">
               <Building className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Widest Range of Stores</h3>
            <p className="text-sm text-muted-foreground">Access deals from over 1500+ partner stores across all major categories.</p>
          </div>
          <div className="text-center p-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4 mx-auto">
               <BadgePercent className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Exclusive Coupons</h3>
            <p className="text-sm text-muted-foreground">Find unique discount codes and offers you won't find anywhere else, adding extra savings.</p>
          </div>
          <div className="text-center p-4">
             <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4 mx-auto">
               <HandCoins className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Completely Free</h3>
            <p className="text-sm text-muted-foreground">Joining and using MagicSaver is, and always will be, absolutely free.</p>
          </div>
        </div>
      </section>

       {/* Our Team (Optional Placeholder) */}
      {/* <section className="container">
        <h2 className="text-3xl font-bold text-center mb-10">Meet the Team</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Add Team Member Cards here */}
      {/*  <p className="text-center col-span-full text-muted-foreground">(Team section content coming soon!)</p>
        </div>
      </section> */}

      {/* Join Us Section */}
      <section className="container text-center py-10">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">Join the MagicSaver Community!</h2>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Start saving on your online shopping today. It takes just a few seconds to sign up.
        </p>
        <Button size="lg" asChild>
          <Link href="/signup">Sign Up Now</Link>
        </Button>
      </section>
    </div>
  );
}
