
// src/app/dashboard/referrals/page.tsx
"use client"; 

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useSearchParams } from 'next/navigation'; 
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { AlertCircle, Gift, Users, IndianRupee, Share2, Copy } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import Link from 'next/link';

function ReferralsPageSkeleton() {
    return (
        <div className="space-y-8 max-w-3xl mx-auto">
             <Skeleton className="h-9 w-1/3" />
             <Card className="shadow-lg">
                 <CardHeader>
                     <Skeleton className="h-7 w-3/4 mb-2" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-5/6" />
                 </CardHeader>
                 <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-1/4" />
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-10 flex-grow" />
                            <Skeleton className="h-10 w-10" />
                            <Skeleton className="h-10 w-10" />
                        </div>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                     </div>
                 </CardContent>
                 <CardFooter>
                    <Skeleton className="h-3 w-1/2" />
                 </CardFooter>
             </Card>
             <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-full" />
                  </CardContent>
               </Card>
        </div>
    );
}

export default function ReferralsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [referralLink, setReferralLink] = React.useState('');
  const [loadingPage, setLoadingPage] = React.useState(true); // Local loading state for this page content

  React.useEffect(() => {
    let isMounted = true;
    if (authLoading) {
      // console.log("REFERRALS_PAGE: Auth loading, waiting...");
      return;
    }

    if (!user || !userProfile) {
      console.log("REFERRALS_PAGE: No user/profile, auth finished. Redirecting.");
      if (isMounted) setLoadingPage(false);
      router.push('/login?message=Please login to access your referrals.');
    } else {
      if (userProfile?.referralCode && typeof window !== 'undefined') {
        const baseUrl = window.location.origin;
        setReferralLink(`${baseUrl}/signup?ref=${userProfile.referralCode}`);
      }
      if (isMounted) setLoadingPage(false);
      // console.log("REFERRALS_PAGE: User and profile loaded.");
    }
    return () => { isMounted = false; };
  }, [user, userProfile, authLoading, router]);

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({
        title: 'Link Copied!',
        description: 'Your referral link has been copied to the clipboard.',
      });
    } catch (err) {
      console.error('Failed to copy referral link:', err);
      toast({
        variant: 'destructive',
        title: 'Copy Failed',
        description: 'Could not copy the link. Please try again or copy manually.',
      });
    }
  };

   const handleShare = async () => {
     if (navigator.share && referralLink) {
       try {
         await navigator.share({
           title: 'Join MagicSaver & Earn Cashback!',
           text: `Sign up for MagicSaver using my link and start earning cashback on your online shopping: ${referralLink}`,
           url: referralLink,
         });
         toast({ title: 'Link Shared', description: 'Referral link shared successfully.' });
       } catch (error) {
         console.error('Error sharing referral link:', error);
         toast({ variant: "destructive", title: 'Share Failed', description: 'Could not share the link.' });
       }
     } else {
       handleCopyLink();
       toast({ description: 'Web Share not supported. Link copied instead.' });
     }
   };

  if (authLoading || loadingPage) {
    return <ProtectedRoute><ReferralsPageSkeleton /></ProtectedRoute>;
  }

  if (!user || !userProfile) { // Should be caught by ProtectedRoute or useEffect redirect
     return (
         <ProtectedRoute>
         <Alert variant="destructive" className="max-w-md mx-auto">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Authentication Required</AlertTitle>
             <AlertDescription>
                 Please log in to view your referral details.
                 <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => router.push('/login')}>Go to Login</Button>
             </AlertDescription>
         </Alert>
         </ProtectedRoute>
     );
   }

  const referralStats = [
    { title: "Friends Referred", value: userProfile.referralCount || 0, icon: Users },
    { title: "Bonus Earned", value: formatCurrency(userProfile.referralBonusEarned || 0), icon: IndianRupee },
  ];

  return (
    <ProtectedRoute>
        <div className="space-y-8 max-w-3xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 sm:w-7 sm:h-7 text-primary" /> Refer & Earn
        </h1>

        <Card className="shadow-lg border-primary/20">
            <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Invite Friends, Earn Rewards!</CardTitle>
            <CardDescription>
                Share your unique referral link with friends. When they sign up and make their first qualifying purchase, you both earn a bonus! (Bonus amount and terms apply).
            </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="referralLink" className="text-base font-medium">Your Unique Referral Link</Label>
                <div className="flex items-center gap-2">
                <Input
                    id="referralLink"
                    readOnly
                    value={referralLink || 'Generating...'}
                    className="bg-muted text-muted-foreground text-sm h-10"
                />
                <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    disabled={!referralLink || authLoading}
                    aria-label="Copy referral link"
                >
                    <Copy className="h-4 w-4" />
                </Button>
                {'share' in navigator && typeof navigator.share === 'function' && (
  <Button
    variant="default"
    size="icon"
    onClick={() => navigator.share({ title: 'Check this out', url: window.location.href })}

  >
    <Share2 className="h-4 w-4" />
  </Button>
)}

                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                {referralStats.map((stat) => (
                <div key={stat.title} className="flex items-center gap-3 p-3 bg-muted/50 rounded-md border">
                    <stat.icon className="w-6 h-6 text-primary" />
                    <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-lg font-semibold">{stat.value}</p>
                    </div>
                </div>
                ))}
            </div>
            </CardContent>
            <CardFooter>
            <p className="text-xs text-muted-foreground">
                Referral bonus details and terms may vary. Check the main referral program page or promotions for current offers.
            </p>
            </CardFooter>
        </Card>

        <Card>
            <CardHeader>
            <CardTitle>How Referrals Work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Share your unique referral link above.</p>
            <p>2. Your friend signs up using your link.</p>
            <p>3. They make their first eligible purchase via MagicSaver.</p>
            <p>4. Once their cashback is confirmed, you both receive a bonus!</p>
            </CardContent>
        </Card>
        </div>
    </ProtectedRoute>
  );
}
