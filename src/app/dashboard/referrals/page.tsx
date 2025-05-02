// src/app/dashboard/referrals/page.tsx
"use client";

import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Share2, Copy, Gift } from 'lucide-react';

// TODO: Implement function to fetch referral data (e.g., referred user count, earnings)
// async function fetchReferralData(userId: string) { ... }

export default function ReferralsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [referralLink, setReferralLink] = useState('');

  React.useEffect(() => {
    if (userProfile?.referralCode && typeof window !== 'undefined') {
       // Construct the referral link using the current window location
       const origin = window.location.origin;
       setReferralLink(`${origin}/signup?ref=${userProfile.referralCode}`);
    } else if (userProfile && !userProfile.referralCode) {
       // Handle case where user might not have a code yet (e.g., needs generation)
       console.warn("User profile loaded but referral code is missing.");
       // TODO: Potentially trigger code generation here if needed
    }
  }, [userProfile]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied!",
        description: "Referral link copied to clipboard.",
      });
    }).catch(err => {
      console.error('Failed to copy: ', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not copy link.",
      });
    });
  };

  // Placeholder for share functionality
  const handleShare = () => {
     if (navigator.share && referralLink) {
       navigator.share({
         title: 'Join CashEase & Earn Cashback!',
         text: `Sign up for CashEase using my link and start earning cashback! ${referralLink}`,
         url: referralLink,
       })
       .then(() => console.log('Successful share'))
       .catch((error) => console.log('Error sharing', error));
     } else {
       // Fallback for browsers that don't support Web Share API
       copyToClipboard(referralLink);
       toast({ description: "Sharing not supported on this browser. Link copied instead." });
     }
   };


  if (authLoading || !userProfile) {
    return <ReferralsPageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Refer & Earn</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gift className="w-6 h-6 text-primary"/>Referral Program</CardTitle>
          <CardDescription>
            Share your unique referral link with friends. When they sign up and earn cashback, you both get rewarded!
             {/* TODO: Add specifics about the reward */}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {userProfile.referralCode ? (
            <div className="space-y-2">
              <label htmlFor="referralLink" className="text-sm font-medium">Your Unique Referral Link</label>
              <div className="flex items-center gap-2">
                <Input
                   id="referralLink"
                   type="text"
                   value={referralLink}
                   readOnly
                   className="flex-grow bg-muted border-muted"
                 />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(referralLink)} aria-label="Copy referral link">
                   <Copy className="h-4 w-4" />
                 </Button>
                 <Button variant="default" size="icon" onClick={handleShare} aria-label="Share referral link" disabled={!navigator.share}>
                   <Share2 className="h-4 w-4" />
                 </Button>
              </div>
            </div>
          ) : (
             <p className="text-muted-foreground">Your referral code is being generated. Please check back shortly.</p>
             // TODO: Add button to trigger generation if manual
          )}

          <div className="grid gap-4 md:grid-cols-2">
             <Card className="bg-muted/50">
                <CardHeader className="pb-2">
                    <CardDescription>Friends Referred</CardDescription>
                     {/* TODO: Fetch and display actual count */}
                    <CardTitle className="text-4xl">0</CardTitle>
                 </CardHeader>
                 <CardContent>
                     <p className="text-xs text-muted-foreground">Number of friends who signed up using your link.</p>
                  </CardContent>
             </Card>
              <Card className="bg-muted/50">
                 <CardHeader className="pb-2">
                     <CardDescription>Referral Earnings</CardDescription>
                      {/* TODO: Fetch and display actual earnings */}
                     <CardTitle className="text-4xl">$0.00</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <p className="text-xs text-muted-foreground">Total bonus cashback earned from referrals.</p>
                   </CardContent>
              </Card>
          </div>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
                {/* TODO: Link to terms */}
               Referral program terms and conditions apply.
            </p>
         </CardFooter>
      </Card>

      {/* TODO: Add section for list of referred users and their status */}
       <Card>
          <CardHeader>
             <CardTitle>Your Referrals</CardTitle>
             <CardDescription>Track the status of users you've referred.</CardDescription>
          </CardHeader>
          <CardContent>
             <p className="text-muted-foreground">Referral tracking list coming soon...</p>
              {/* Placeholder for Table or List */}
           </CardContent>
       </Card>

    </div>
  );
}


function ReferralsPageSkeleton() {
  return (
     <div className="space-y-8">
       <Skeleton className="h-8 w-48" /> {/* Title */}

        <Card>
           <CardHeader>
             <Skeleton className="h-7 w-40 mb-2" />
             <Skeleton className="h-4 w-full mb-1" />
             <Skeleton className="h-4 w-3/4" />
           </CardHeader>
           <CardContent className="space-y-6">
               <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <div className="flex items-center gap-2">
                     <Skeleton className="h-10 flex-grow" />
                     <Skeleton className="h-10 w-10" />
                     <Skeleton className="h-10 w-10" />
                  </div>
               </div>

               <div className="grid gap-4 md:grid-cols-2">
                   <Card className="bg-muted/50">
                      <CardHeader className="pb-2">
                          <Skeleton className="h-4 w-24 mb-2" />
                          <Skeleton className="h-10 w-12" />
                       </CardHeader>
                       <CardContent>
                           <Skeleton className="h-3 w-full" />
                        </CardContent>
                   </Card>
                   <Card className="bg-muted/50">
                       <CardHeader className="pb-2">
                           <Skeleton className="h-4 w-28 mb-2" />
                           <Skeleton className="h-10 w-20" />
                        </CardHeader>
                        <CardContent>
                           <Skeleton className="h-3 w-full" />
                        </CardContent>
                    </Card>
               </div>
           </CardContent>
            <CardFooter>
               <Skeleton className="h-3 w-1/2" />
            </CardFooter>
        </Card>

        <Card>
           <CardHeader>
             <Skeleton className="h-6 w-32 mb-2" />
             <Skeleton className="h-4 w-1/2" />
           </CardHeader>
           <CardContent>
              <Skeleton className="h-12 w-full" />
            </CardContent>
        </Card>

     </div>
  );
}
