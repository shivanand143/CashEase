
"use client";

import * as React from 'react';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { HelpCircle, ChevronRight } from 'lucide-react';

const faqData = [
  {
    question: "What is MagicSaver and how does it work?",
    answer: "MagicSaver is a platform that helps you earn real cashback and find the best coupons when you shop online at your favorite stores. Simply click through our links to a retailer's site, shop as usual, and we track your purchase to give you cashback."
  },
  {
    question: "Is MagicSaver free to use?",
    answer: "Yes, MagicSaver is completely free to use! There are no hidden charges or subscription fees."
  },
  {
    question: "How do I earn cashback?",
    answer: "1. Sign up/Log in to MagicSaver. 2. Browse for your favorite store or offer. 3. Click on the 'Activate Cashback' or 'Get Code' button. 4. You'll be redirected to the retailer's site. Shop as you normally would. 5. Your cashback will be tracked and added to your MagicSaver account, usually within 72 hours."
  },
  {
    question: "How long does it take for cashback to get confirmed?",
    answer: "Cashback initially appears as 'Pending'. It gets confirmed after the retailer's return/cancellation period is over, which usually takes 30-90 days. Once confirmed, you can withdraw it."
  },
  {
    question: "What is the minimum amount I need to withdraw cashback?",
    answer: "You need a minimum of ₹250 in 'Confirmed' cashback to request a payout to your bank account or as gift cards."
  },
  {
    question: "What if my cashback is not tracked?",
    answer: "If your cashback isn't tracked within 72 hours, please file a 'Missing Cashback Claim' through your dashboard. Ensure you've followed all terms and conditions, like not using other coupon sites or ad-blockers."
  },
  {
    question: "Can I use coupons along with cashback offers?",
    answer: "Yes, absolutely! We encourage you to use coupons listed on MagicSaver for extra savings. However, using coupons not provided by us might invalidate your cashback."
  }
];

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <HelpCircle className="w-12 h-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl md:text-4xl font-bold">Frequently Asked Questions</h1>
        <p className="text-muted-foreground mt-2">
          Find answers to common questions about MagicSaver.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full border rounded-lg shadow-sm bg-card">
        {faqData.map((item, index) => (
          <AccordionItem key={index} value={`item-${index + 1}`} className="border-b last:border-b-0">
            <AccordionTrigger className="p-4 text-left hover:bg-muted/50">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="p-4 pt-0 text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <section className="text-center mt-12 pt-8 border-t">
        <h2 className="text-xl font-semibold mb-3">Still have questions?</h2>
        <p className="text-muted-foreground mb-6">
          If you can't find the answer you're looking for, feel free to reach out to our support team.
        </p>
        <Button asChild>
          <Link href="/contact">
            Contact Support <ChevronRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
