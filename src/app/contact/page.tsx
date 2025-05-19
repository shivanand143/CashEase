
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mail, MessageSquare, User, HelpCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from 'lucide-react';

const contactSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  subject: z.string().min(1, { message: "Please select a subject." }),
  message: z.string().min(10, { message: "Message must be at least 10 characters." }).max(500, { message: "Message cannot exceed 500 characters." }),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (data: ContactFormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    console.log("Contact form submitted:", data);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Example success/error handling
    const success = Math.random() > 0.2; // Simulate 80% success rate

    if (success) {
      toast({
        title: "Message Sent!",
        description: "Thank you for contacting us. We'll get back to you soon.",
      });
      setSubmitSuccess(true);
      reset(); // Reset form fields
    } else {
      const errorMsg = "Failed to send message. Please try again later.";
      setSubmitError(errorMsg);
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: errorMsg,
      });
    }
    setIsSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <Mail className="w-12 h-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl md:text-4xl font-bold">Contact Us</h1>
        <p className="text-muted-foreground mt-2">
          Have a question or feedback? We'd love to hear from you!
        </p>
      </div>

      <Card className="shadow-lg border">
        <CardHeader>
          <CardTitle>Send us a Message</CardTitle>
          <CardDescription>Fill out the form below and our team will get back to you as soon as possible.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
          {submitSuccess && (
            <Alert className="mb-4 border-green-500 bg-green-50 text-green-700 [&>svg]:text-green-700">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>Your message has been sent. We'll reply shortly.</AlertDescription>
            </Alert>
          )}
          {!submitSuccess && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="name" placeholder="Your Name" {...register('name')} disabled={isSubmitting} className="pl-9" />
                  </div>
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="you@example.com" {...register('email')} disabled={isSubmitting} className="pl-9" />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="subject">Subject</Label>
                <div className="relative">
                   <HelpCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Select
                      onValueChange={(value) => control._formValues.subject = value} // Direct update, consider setValue
                      defaultValue=""
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="subject" className="pl-9">
                        <SelectValue placeholder="Select a subject..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general-inquiry">General Inquiry</SelectItem>
                        <SelectItem value="cashback-issue">Cashback Issue</SelectItem>
                        <SelectItem value="account-problem">Account Problem</SelectItem>
                        <SelectItem value="feedback">Feedback & Suggestions</SelectItem>
                        <SelectItem value="partnership">Partnership Inquiry</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>
                 {/* Hidden input for react-hook-form registration, as Select doesn't directly register */}
                 <input type="hidden" {...register('subject')} />
                 {errors.subject && <p className="text-sm text-destructive">{errors.subject.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="message">Your Message</Label>
                <div className="relative">
                     <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Textarea
                        id="message"
                        placeholder="Tell us more about your query..."
                        rows={5}
                        {...register('message')}
                        disabled={isSubmitting}
                        className="pl-9"
                    />
                </div>
                {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        <p>You can also reach us at <a href="mailto:support@magicsaver.example.com" className="text-primary hover:underline">support@magicsaver.example.com</a>.</p>
        <p>We typically respond within 24-48 business hours.</p>
      </div>
    </div>
  );
}
