"use client";

import * as React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button'; // Import Button
import Link from 'next/link'; // Import Link

// Placeholder FAQ data - replace with actual FAQs from DB or CMS
const faqData = [
  {
    id: "q1",
    question: "How does CashEase work?",
    answer: "It's simple! 1. Find your favorite store on CashEase. 2. Click the 'Activate Cashback' link. 3. Shop on the retailer's site as usual. 4. Your cashback tracks automatically and gets added to your CashEase account after confirmation.",
  },
  {
    id: "q2",
    question: "Is CashEase free to use?",
    answer: "Yes, CashEase is completely free to join and use. We earn a commission from retailers for driving sales, and we share a majority of that commission with you as cashback.",
  },
  {
    id: "q3",
    question: "How long does it take for cashback to track?",
    answer: "Cashback usually tracks within 72 hours of your purchase and appears as 'Pending' in your account. However, it can sometimes take longer depending on the retailer.",
  },
  {
    id: "q4",
    question: "When does my cashback get confirmed?",
    answer: "Retailers need to wait for the return/cancellation period to expire. Confirmation typically takes 30-90 days from the date of purchase. Once confirmed, the status changes to 'Confirmed'.",
  },
  {
    id: "q5",
    question: "How can I withdraw my cashback?",
    answer: "Once you have ₹250 or more in 'Confirmed' cashback, you can request a payout. We offer bank transfers (NEFT/UPI) and Amazon/Flipkart gift card redemptions.",
  },
   {
    id: "q6",
    question: "What if my cashback doesn't track?",
    answer: "Sometimes tracking can fail due to technical issues or browser settings. If your cashback doesn't appear as 'Pending' within 72 hours, please visit your dashboard and file a 'Missing Cashback Claim' within 10 days of your purchase.",
  },
   {
    id: "q7",
    question: "Can I use other coupons with CashEase cashback?",
    answer: "Using coupon codes not provided by CashEase might invalidate your cashback for that purchase. It's best to use coupons listed on our platform or check the store's specific terms on CashEase.",
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-bold flex items-center justify-center gap-2">
            <HelpCircle className="w-8 h-8 text-primary" /> Frequently Asked Questions
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Find answers to common questions about CashEase.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full border rounded-lg shadow-sm bg-card">
        {faqData.map((faq) => (
          <AccordionItem key={faq.id} value={faq.id} className="border-b last:border-b-0">
            <AccordionTrigger className="p-4 text-left hover:bg-muted/50 transition-colors text-base">
               {faq.question}
            </AccordionTrigger>
            <AccordionContent className="p-4 pt-0 text-muted-foreground text-sm">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

       <section className="text-center mt-12 pt-8 border-t">
           <h2 className="text-xl font-semibold mb-3">Still have questions?</h2>
           <p className="text-muted-foreground mb-4">
              Contact our support team, and we'll be happy to help.
           </p>
            <Button asChild>
               <Link href="/contact">Contact Support</Link>
            </Button>
       </section>
    </div>
  );
}
