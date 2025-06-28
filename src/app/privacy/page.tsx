
"use client";
import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl md:text-4xl font-bold">Privacy Policy</h1>
        <p className="text-muted-foreground mt-2">
          Your privacy is important to us.
        </p>
      </div>

      <Card className="shadow-lg border">
        <CardHeader>
          <CardTitle>MagicSaver Privacy Policy</CardTitle>
          <CardDescription>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
          <p>
            This Privacy Policy describes Our policies and procedures on the collection, use and disclosure of Your information when You use the Service and tells You about Your privacy rights and how the law protects You.
          </p>

          <h3 className="font-semibold text-lg">1. Information We Collect</h3>
          <p>
            We may collect several types of information from and about users of our Service, including:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Personal Data:</strong> While using Our Service, We may ask You to provide Us with certain personally identifiable information that can be used to contact or identify You. Personally identifiable information may include, but is not limited to: Email address, First name and last name, Usage Data.</li>
            <li><strong>Usage Data:</strong> Usage Data is collected automatically when using the Service. This may include information such as Your Device's Internet Protocol address (e.g. IP address), browser type, browser version, the pages of our Service that You visit, the time and date of Your visit, the time spent on those pages, and other diagnostic data.</li>
          </ul>

          <h3 className="font-semibold text-lg">2. How We Use Your Information</h3>
          <p>
            We use the information we collect for various purposes, including to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide, operate, and maintain our Service.</li>
            <li>Improve, personalize, and expand our Service.</li>
            <li>Understand and analyze how you use our Service.</li>
            <li>Communicate with you, either directly or through one of our partners, for customer service, to provide you with updates and other information relating to the Service, and for marketing and promotional purposes.</li>
            <li>Process your transactions and manage your cashback earnings.</li>
          </ul>

          <h3 className="font-semibold text-lg">3. Data Security</h3>
          <p>
            The security of Your data is important to Us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While We strive to use commercially acceptable means to protect Your Personal Data, We cannot guarantee its absolute security.
          </p>
          
          <h3 className="font-semibold text-lg">4. Changes to This Privacy Policy</h3>
          <p>
            We may update Our Privacy Policy from time to time. We will notify You of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
          </p>

          <h3 className="font-semibold text-lg">5. Contact Us</h3>
          <p>
            If you have any questions about this Privacy Policy, You can contact us by visiting the contact page on our website.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
