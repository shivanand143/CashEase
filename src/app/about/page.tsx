
"use client";
import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Target, Gift, IndianRupee, ArrowRight, ShoppingBag } from 'lucide-react';

export const dynamic = 'force-dynamic';
export default function AboutPage() {
  const teamMembers = [
    { name: 'Vinod Hosamani', role: 'Lead Developer', imageUrl: 'https://placehold.co/150x150.png', dataAiHint: "person team member" },
    { name: 'G Ajay Kumar', role: 'Frontend Developer', imageUrl: 'https://placehold.co/150x150.png', dataAiHint: "person team member" },
    { name: 'Sahil S Nangnure', role: 'Backend Developer', imageUrl: 'https://placehold.co/150x150.png', dataAiHint: "person team member" },
    { name: 'Shivanand', role: 'UI/UX Designer', imageUrl: 'https://placehold.co/150x150.png', dataAiHint: "person team member" },
  ];

  const whyChooseUsItems = [
    { title: "Real Cashback", description: "Earn actual money, not just points, transferable directly to your bank account or as gift cards.", icon: IndianRupee },
    { title: "Widest Range of Stores", description: "Partnered with over 1500+ online stores across all major categories.", icon: ShoppingBag },
    { title: "Exclusive Deals & Coupons", description: "Access to unique discounts and coupon codes you won't find anywhere else.", icon: Gift },
    { title: "User-Friendly Experience", description: "Easy-to-use platform designed to make saving money simple and enjoyable.", icon: Users },
  ];

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Hero Section */}
      <section className="relative text-center py-16 md:py-24 lg:py-32 bg-gradient-to-b from-primary/10 via-background to-secondary/10 rounded-lg overflow-hidden border border-border/30 shadow-sm">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: `url("https://www.transparenttextures.com/patterns/ पैसा-stack.png")` }}></div>
        <div className="container relative z-10">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-foreground">About MagicSaver</h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            India's most rewarding way to shop online. We help you save money every time you shop!
          </p>
        </div>
      </section>

      {/* Our Mission Section */}
      <section className="container grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div className="order-last md:order-first space-y-4">
          <h2 className="text-2xl md:text-3xl font-semibold text-primary flex items-center gap-2"><Target className="w-7 h-7" /> Our Mission</h2>
          <p className="text-muted-foreground leading-relaxed">
            At MagicSaver, our mission is simple: to make online shopping more rewarding for everyone. We believe that saving money shouldn't be complicated. That's why we've built a platform that brings you the best cashback offers and coupons from your favorite online stores, all in one place.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We strive to provide a seamless and trustworthy experience, ensuring you get the most value out of every purchase. Your savings journey is our top priority.
          </p>
        </div>
        <div className="flex justify-center items-center">
          <Image
            src="https://placehold.co/500x350.png?text=Our+Mission"
            alt="Our Mission at MagicSaver"
            width={500}
            height={350}
            className="rounded-lg shadow-xl border"
            data-ai-hint="teamwork mission target"
          />
        </div>
      </section>

      {/* Meet the Team Section */}
      <section className="container py-12">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-10 md:mb-12">Meet Our Team</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {teamMembers.map((member) => (
            <Card key={member.name} className="text-center p-6 border-0 shadow-lg hover:shadow-xl transition-shadow">
              <Image
                src={member.imageUrl}
                alt={member.name}
                width={120}
                height={120}
                className="rounded-full mx-auto mb-4 border-4 border-primary/20"
                data-ai-hint={member.dataAiHint}
              />
              <CardTitle className="text-lg font-bold">{member.name}</CardTitle>
              <CardDescription>{member.role}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="container py-12 md:py-16 bg-muted/50 rounded-lg border border-border/50">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-10 md:mb-12">Why Choose MagicSaver?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {whyChooseUsItems.map((item, index) => (
            <Card key={index} className="text-center p-4 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border-2 border-primary text-primary mb-4 mx-auto">
                <item.icon className="w-8 h-8" />
              </div>
              <CardTitle className="text-lg font-semibold mb-2">{item.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Join Us Section */}
      <section className="container text-center py-10 md:py-16">
        <h2 className="text-2xl md:text-3xl font-semibold mb-4">Ready to Start Saving?</h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Join millions of smart shoppers who are earning cashback and discovering unbeatable deals with MagicSaver.
          It's free, easy, and incredibly rewarding!
        </p>
        <Button size="lg" asChild className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-md px-8 py-3 text-base">
          <Link href="/signup">
            Sign Up for Free <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
