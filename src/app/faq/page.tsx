// src/app/faq/page.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';

const faqs = [
  {
    id: 'faq-1',
    question: 'What is CashEase and how does it work?',
    answer: 'CashEase is a platform that gives you cashback when you shop online at your favorite stores like Amazon, Flipkart, Myntra, etc. Simply click through CashEase to the retailer\'s website, shop as usual, and we track your purchase to give you cashback. We earn a commission from the retailer, and share most of it with you!'
  },
  {
    id: 'faq-2',
    question: 'Is CashEase free to use?',
    answer: 'Yes, CashEase is completely free to join and use. There are no hidden charges or fees.'
  },
  {
    id: 'faq-3',
    question: 'How is cashback tracked?',
    answer: 'When you click on a link from CashEase to a retailer\'s site, a unique tracking code is activated. The retailer recognizes this code when you make a purchase, allowing us to track the sale and credit cashback to your CashEase account.'
  },
  {
    id: 'faq-4',
    question: 'How long does it take for cashback to track?',
    answer: 'Cashback usually tracks within 72 hours of your purchase and appears as "Pending" in your account. However, it can sometimes take longer depending on the retailer.'
  },
  {
    id: 'faq-5',
    question: 'When does my cashback get confirmed?',
    answer: 'Cashback status changes from "Pending" to "Confirmed" after the retailer\'s return/cancellation period is over (typically 30-60 days). This ensures the order was not returned or cancelled.'
  },
  {
    id: 'faq-6',
    question: 'How can I withdraw my cashback?',
    answer: 'Once you have ₹250 or more in "Confirmed" cashback, you can request a payout. We offer options like direct bank transfer (NEFT) or Amazon/Flipkart gift cards.'
  },
    {
    id: 'faq-7',
    question: 'What if my cashback doesn\'t track?',
    answer: 'If your cashback doesn\'t track within 72 hours, please ensure you followed all offer terms (like not using other coupon codes). If it still hasn\'t tracked, you can file a missing cashback claim through your account dashboard, and we will investigate it with the retailer.'
  },
];

export default function FaqPage() {
  return (
    // Wrap content in a container div with padding
    <div className="container py-8">
      <div className="space-y-8 md:space-y-12 max-w-3xl mx-auto">
        <section className="text-center pt-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center justify-center gap-2">
            <HelpCircle className="w-8 h-8" /> Frequently Asked Questions
          </h1>
          <p className="text-lg text-muted-foreground">Find answers to common questions about CashEase.</p>
        </section>

        <section>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger className="text-left font-semibold text-lg hover:text-primary">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="text-center py-8 border-t">
          <h2 className="text-xl font-semibold mb-2">Still have questions?</h2>
          <p className="text-muted-foreground mb-4">
            Contact our support team, and we'll be happy to help.
          </p>
          <Button asChild>
            <Link href="/contact">Contact Support</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
