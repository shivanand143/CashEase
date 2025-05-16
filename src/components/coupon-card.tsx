
'use client';

import type { Coupon, Store } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag, ExternalLink, Clock, Store as StoreIcon, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { trackClick, TrackClickData } from '@/lib/actions/tracking';
import { v4 as uuidv4 } from 'uuid';

interface CouponCardProps {
  coupon: Coupon & { store?: Store };
}

export default function CouponCard({ coupon }: CouponCardProps) {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const appendClickId = (url: string, clickId: string): string => {
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('subid', clickId);
      urlObj.searchParams.set('aff_sub', clickId);
      return urlObj.toString();
    } catch (e) {
      console.warn("Invalid URL for click tracking, returning original:", url);
      return url;
    }
  };

  const handleInteraction = async (isCode: boolean, codeOrLink?: string | null) => {
    if (authLoading) {
      toast({ title: "Please wait", description: "Checking authentication..."});
      return;
    }

    const clickId = uuidv4();
    let targetUrl = coupon.link || coupon.store?.affiliateLink || '#';
    if (targetUrl === '#') {
        toast({ title: "Link Error", description: "No valid link for this offer.", variant: "destructive"});
        return;
    }
    targetUrl = appendClickId(targetUrl, clickId);


    if (!user) {
        sessionStorage.setItem('loginRedirectUrl', targetUrl);
        sessionStorage.setItem('loginRedirectSource', router.asPath);
        router.push(`/login?message=Please login to use this ${isCode ? 'code' : 'deal'} and track cashback.`);
        return;
    }

    if (user && coupon.storeId) {
      const clickData: Omit<TrackClickData, 'timestamp'> = {
        userId: user.uid,
        storeId: coupon.storeId,
        storeName: coupon.store?.name || null,
        couponId: coupon.id,
        productId: null,
        productName: null,
        clickId: clickId,
        affiliateLink: targetUrl,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      };
      try {
        const trackResult = await trackClick(clickData);
        if(trackResult.success){
            console.log(`Tracked click for ${isCode ? 'code' : 'deal'} coupon ${coupon.id} by user ${user.uid}, clickId: ${clickId}`);
        } else {
            console.error("Failed to track coupon click (server action error):", trackResult.error);
            toast({title: "Tracking Issue", description: "Could not fully track click, but proceeding.", variant: "destructive"})
        }
      } catch (trackError) {
        console.error(`Error tracking ${isCode ? 'code' : 'deal'} click:`, trackError);
      }
    }

    if (isCode && codeOrLink) {
      try {
        await navigator.clipboard.writeText(codeOrLink);
        toast({
          title: 'Code Copied!',
          description: `Coupon code "${codeOrLink}" copied. Redirecting...`,
        });
        setTimeout(() => {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }, 500);
      } catch (err) {
        console.error('Failed to copy code:', err);
        toast({ variant: 'destructive', title: 'Copy Failed', description: 'Could not copy the code. Redirecting anyway...' });
        window.open(targetUrl, '_blank', 'noopener,noreferrer'); // Still redirect
      }
    } else {
      // For "Get Deal" or fallback
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

   const handleCardClick = (e: React.MouseEvent) => {
     if ((e.target as HTMLElement).closest('button')) {
       return;
     }
     if (coupon.storeId) {
       router.push(`/stores/${coupon.storeId}`);
     } else {
        toast({title: "Navigation Error", description: "Store details are not available for this coupon."})
     }
   };

  const expiryDate = coupon.expiryDate ? safeToDate(coupon.expiryDate) : null;
  const isExpired = expiryDate ? expiryDate < new Date() : false;
  const storeName = coupon.store?.name ?? 'Store';
  const storeLogoUrl = coupon.store?.logoUrl ?? '/placeholder-logo.png';

  return (
    <Card
      className={`flex flex-col justify-between border rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 ${
        isExpired ? 'opacity-60 bg-muted/50' : ''
      }`}
    >
      <div className="p-4 pb-2 cursor-pointer hover:bg-muted/30 rounded-t-lg transition-colors" onClick={handleCardClick}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {coupon.store?.logoUrl ? (
                  <Image
                    src={coupon.store.logoUrl}
                    alt={`${storeName} logo`}
                    width={24}
                    height={24}
                    className="rounded-sm object-contain"
                    data-ai-hint={`${storeName} logo`}
                    onError={(e) => ((e.target as HTMLImageElement).src = 'https://placehold.co/24x24.png?text=logo')}
                  />
                ) : (
                  <StoreIcon className="w-6 h-6 text-muted-foreground" />
                )}
                <CardTitle className="text-base font-semibold leading-tight">
                  {storeName} Offer
                </CardTitle>
              </div>
              {isExpired && <Badge variant="destructive">Expired</Badge>}
              {coupon.isFeatured && !isExpired && <Badge variant="secondary" className="bg-accent text-accent-foreground">Featured</Badge>}
            </div>
            <CardDescription className="text-sm leading-snug h-10 line-clamp-2">
              {coupon.description}
            </CardDescription>
      </div>
      <CardContent className="p-4 pt-0 pb-2 flex-grow">
         {expiryDate && !isExpired && (
           <div className="flex items-center text-xs text-muted-foreground mb-2">
             <Clock className="w-3 h-3 mr-1" />
             Expires {formatDistanceToNow(expiryDate, { addSuffix: true })}
           </div>
         )}
      </CardContent>
      <CardFooter className="p-4 pt-0 bg-muted/30 border-t">
        {coupon.code ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed border-primary text-primary hover:bg-primary/10 justify-between group"
            onClick={(e) => {
               e.stopPropagation();
               handleInteraction(true, coupon.code!);
            }}
            disabled={isExpired || authLoading}
          >
             {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="font-mono font-medium truncate">{coupon.code}</span>}
             <span className="text-xs opacity-80 group-hover:opacity-100 transition-opacity">Copy Code</span>
          </Button>
        ) : (
          <Button
             variant="default"
             size="sm"
             className="w-full bg-secondary hover:bg-secondary/90"
             onClick={(e) => {
                e.stopPropagation();
                handleInteraction(false, coupon.link);
             }}
             disabled={isExpired || authLoading}
           >
             {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Deal"}
             {!authLoading && <ExternalLink className="w-4 h-4 ml-1" />}
           </Button>
        )}
      </CardFooter>
    </Card>
  );
}
