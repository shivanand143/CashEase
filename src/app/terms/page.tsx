
"use client";
import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function TermsOfServicePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <FileText className="w-12 h-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl md:text-4xl font-bold">Terms of Service</h1>
        <p className="text-muted-foreground mt-2">
          Please read our terms and conditions carefully.
        </p>
      </div>

      <Card className="shadow-lg border">
        <CardHeader>
          <CardTitle>MagicSaver Terms of Service</CardTitle>
          <CardDescription>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
          <p>
            Welcome to MagicSaver! These terms and conditions outline the rules and regulations for the use of our website and services.
          </p>

          <h3 className="font-semibold text-lg">1. Acceptance of Terms</h3>
          <p>
            By accessing this website, we assume you accept these terms and conditions. Do not continue to use MagicSaver if you do not agree to all of the terms and conditions stated on this page.
          </p>

          <h3 className="font-semibold text-lg">2. Use of the Service</h3>
          <p>
            You agree to use our Service for lawful purposes only and in a way that does not infringe the rights of, restrict or inhibit anyone else's use and enjoyment of the Service. Prohibited behavior includes harassing or causing distress or inconvenience to any other user, transmitting obscene or offensive content, or disrupting the normal flow of dialogue within our Service.
          </p>

          <h3 className="font-semibold text-lg">3. User Accounts</h3>
          <p>
            To access certain features of the Service, you must create an account. You are responsible for safeguarding your account password and for any activities or actions under your password. You agree not to disclose your password to any third party.
          </p>

          <h3 className="font-semibold text-lg">4. Cashback and Rewards</h3>
          <p>
            Cashback is earned on qualifying purchases made through affiliate links on our Service. MagicSaver is not responsible for the tracking of purchases or the final confirmation of cashback, which is determined by our retail partners. We reserve the right to adjust or cancel cashback for reasons including, but not limited to, returned products, cancelled orders, or misuse of the Service.
          </p>

          <h3 className="font-semibold text-lg">5. Limitation of Liability</h3>
          <p>
            In no event shall MagicSaver, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
          </p>

          <h3 className="font-semibold text-lg">6. Governing Law</h3>
          <p>
            These Terms shall be governed and construed in accordance with the laws of India, without regard to its conflict of law provisions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
