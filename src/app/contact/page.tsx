// src/app/contact/page.tsx
"use client"; // Use client for form handling if added later

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Mail, Phone } from 'lucide-react';

export default function ContactPage() {

  // Basic submit handler (replace with actual logic)
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // TODO: Implement form submission logic (e.g., send email, save to DB)
    alert("Form submitted! (Placeholder - functionality not implemented)");
    // Consider resetting the form here
  };

  return (
    <div className="space-y-12 py-8 md:py-16">
      <section className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-primary">
          Contact Us
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Have questions or need support? Get in touch with the CashEase team.
        </p>
      </section>

      <section className="container px-4 md:px-6 grid md:grid-cols-2 gap-8 md:gap-12 items-start">
        {/* Contact Form */}
        <Card className="shadow-lg border border-border/50">
          <CardHeader>
            <CardTitle>Send us a Message</CardTitle>
            <CardDescription>Fill out the form below and we'll get back to you as soon as possible.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Your Name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="your.email@example.com" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" placeholder="e.g., Cashback Inquiry, Payout Issue" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" placeholder="Describe your query in detail..." rows={5} required />
              </div>
              <Button type="submit" className="w-full">Send Message</Button>
            </form>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <div className="space-y-6 pt-4 md:pt-0">
           <h2 className="text-2xl font-bold">Other Ways to Reach Us</h2>
           <div className="space-y-4 text-muted-foreground">
              <div className="flex items-start gap-3">
                 <Mail className="w-5 h-5 mt-1 text-primary shrink-0" />
                 <div>
                    <p className="font-medium text-foreground">Email Support</p>
                    <a href="mailto:support@cashease.example.com" className="text-primary hover:underline">
                       support@cashease.example.com
                    </a>
                    <p className="text-xs">We typically respond within 24-48 hours.</p>
                 </div>
              </div>
               {/* Add Phone if applicable */}
               {/* <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 mt-1 text-primary shrink-0" />
                  <div>
                     <p className="font-medium text-foreground">Phone Support</p>
                     <p>+91-XXX-XXXXXXX (Mon-Fri, 10 AM - 6 PM IST)</p>
                  </div>
               </div> */}
                <div className="flex items-start gap-3">
                   <div className="w-5 h-5 mt-1 text-primary shrink-0">📍</div> {/* Placeholder for address icon */}
                  <div>
                     <p className="font-medium text-foreground">Registered Office</p>
                     <p>123 Cashback Lane, Savings City, India 500001</p>
                     <p className="text-xs">(Please note: This is not a customer service location)</p>
                  </div>
               </div>
           </div>
             {/* Consider adding social media links here */}
        </div>
      </section>
    </div>
  );
}
