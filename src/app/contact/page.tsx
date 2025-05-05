// src/app/contact/page.tsx
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link'; // Import Link component
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Send, User, MessageSquare, HelpCircle } from 'lucide-react';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Please select a subject'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(500, 'Message cannot exceed 500 characters'),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  const onSubmit = async (data: ContactFormValues) => {
    setIsSubmitting(true);
    console.log('Contact Form Data:', data);

    // --- Placeholder for actual submission logic ---
    // In a real app, you'd send this data to your backend (e.g., via API route or server action)
    // which would then process it (e.g., send an email, save to DB).
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

    // --- Example Success ---
    toast({
      title: 'Message Sent!',
      description: 'Thank you for contacting us. We will get back to you shortly.',
    });
    form.reset(); // Clear the form

    // --- Example Error (uncomment to test) ---
    // toast({
    //   variant: 'destructive',
    //   title: 'Submission Failed',
    //   description: 'Could not send your message. Please try again later.',
    // });

    setIsSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-bold flex items-center justify-center gap-2">
            <Mail className="w-8 h-8 text-primary" /> Contact Us
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Have questions or need help? Reach out to us!
        </p>
      </div>

      <Card className="shadow-lg border">
        <CardHeader>
          <CardTitle>Send us a Message</CardTitle>
          <CardDescription>Fill out the form below and we'll respond as soon as possible.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-1"><User className="w-3 h-3" /> Name</Label>
                <Input id="name" {...form.register('name')} placeholder="Your Name" disabled={isSubmitting} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-1"><Mail className="w-3 h-3" /> Email</Label>
                <Input id="email" type="email" {...form.register('email')} placeholder="your.email@example.com" disabled={isSubmitting} />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
               <Label htmlFor="subject" className="flex items-center gap-1"><HelpCircle className="w-3 h-3" /> Subject</Label>
               <Select
                  value={form.watch('subject')}
                  onValueChange={(value) => form.setValue('subject', value, { shouldValidate: true })}
                  disabled={isSubmitting}
               >
                  <SelectTrigger id="subject">
                     <SelectValue placeholder="Select a reason for contacting..." />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="general_inquiry">General Inquiry</SelectItem>
                     <SelectItem value="missing_cashback">Missing Cashback Claim</SelectItem>
                     <SelectItem value="payout_issue">Payout Issue</SelectItem>
                     <SelectItem value="account_problem">Account Problem</SelectItem>
                     <SelectItem value="feedback">Feedback/Suggestion</SelectItem>
                     <SelectItem value="partnership">Partnership Inquiry</SelectItem>
                     <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
               </Select>
               {form.formState.errors.subject && (
                  <p className="text-sm text-destructive">{form.formState.errors.subject.message}</p>
               )}
            </div>


            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="message" className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Message</Label>
              <Textarea
                id="message"
                {...form.register('message')}
                placeholder="Please describe your query in detail..."
                rows={5}
                disabled={isSubmitting}
              />
              {form.formState.errors.message && (
                <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" /> Send Message</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

       {/* Additional Contact Info (Optional) */}
       <div className="text-center text-sm text-muted-foreground space-y-2">
           <p>You can also reach us via email at: <a href="mailto:support@cashease.example.com" className="text-primary hover:underline">support@cashease.example.com</a></p>
           <p>For faster resolution, please check our <Link href="/faq" className="text-primary hover:underline">FAQ page</Link>.</p>
       </div>

    </div>
  );
}