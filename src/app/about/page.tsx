// src/app/about/page.tsx
import * as React from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IndianRupee, Target, Users, Handshake } from 'lucide-react';

export default function AboutPage() {
  return (
    // Removed container div
    <div className="space-y-12 py-8 md:py-16">
      <section className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-primary">
          About CashEase
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Your trusted partner for smarter online shopping and effortless cashback savings in India.
        </p>
      </section>

      <section className="px-4 md:px-6">
        <Card className="overflow-hidden shadow-lg border border-border/50">
          <div className="grid md:grid-cols-2 items-center">
            <div className="p-8 md:p-12 space-y-4">
              <h2 className="text-3xl font-bold flex items-center gap-2">
                <Target className="w-8 h-8 text-primary" /> Our Mission
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                At CashEase, our mission is simple: to make online shopping more rewarding for everyone. We believe you deserve to get something back for your loyalty and purchases. We strive to be the most reliable and user-friendly cashback platform, helping you save money effortlessly every time you shop online.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We partner with hundreds of popular online retailers across India to bring you the best cashback offers and exclusive coupons, ensuring you always get the maximum savings.
              </p>
            </div>
            <div className="relative h-64 md:h-full">
              <Image
                data-ai-hint="team working online shopping collaboration"
                src="https://picsum.photos/seed/about-mission/600/400"
                alt="Our Mission Illustration"
                layout="fill"
                objectFit="cover"
              />
            </div>
          </div>
        </Card>
      </section>

      <section className="px-4 md:px-6">
        <h2 className="text-3xl font-bold text-center mb-8">Why Choose CashEase?</h2>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          <Card className="text-center p-6 hover:shadow-lg transition-shadow border border-border/50 rounded-lg">
            <CardHeader className="p-0 mb-4">
              <div className="mx-auto bg-primary/10 rounded-full p-3 w-fit">
                <IndianRupee className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="mt-3">Highest Cashback Rates</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                We negotiate the best deals to offer you the highest possible cashback rates from top online stores.
              </p>
            </CardContent>
          </Card>
          <Card className="text-center p-6 hover:shadow-lg transition-shadow border border-border/50 rounded-lg">
            <CardHeader className="p-0 mb-4">
              <div className="mx-auto bg-secondary/10 rounded-full p-3 w-fit">
                <Users className="w-8 h-8 text-secondary" />
              </div>
              <CardTitle className="mt-3">Wide Range of Stores</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                Shop from over 1500+ partner stores covering categories like fashion, electronics, travel, groceries, and more.
              </p>
            </CardContent>
          </Card>
          <Card className="text-center p-6 hover:shadow-lg transition-shadow border border-border/50 rounded-lg">
            <CardHeader className="p-0 mb-4">
              <div className="mx-auto bg-accent/10 rounded-full p-3 w-fit">
                <Handshake className="w-8 h-8 text-accent" />
              </div>
              <CardTitle className="mt-3">Easy & Reliable</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm text-muted-foreground">
                Our platform is simple to use, with reliable cashback tracking and hassle-free payout options.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-4 md:px-6 text-center bg-muted/50 py-12 rounded-lg">
        <h2 className="text-3xl font-bold mb-4">Join the CashEase Community</h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-6">
          Start saving on your online purchases today. Signing up is free and takes less than a minute!
        </p>
        {/* <Button size="lg">Sign Up Now</Button> */}
      </section>
    </div>
  );
}
