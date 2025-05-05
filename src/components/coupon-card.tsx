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
import { Tag, ExternalLink, Clock, Store as StoreIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth'; // Import useAuth to check user login status
import { useRouter } from 'next/navigation'; // Import useRouter for redirection

interface CouponCardProps {
  coupon: Coupon & { store?: Store }; // Coupon data, optionally with nested store data
}

// Define a dummy trackClick function to avoid import errors
async function trackClick(data: any): Promise<void> {
  console.log('Tracking click (dummy function):', data);
  return Promise.resolve();
}

export default function CouponCard({ coupon }: CouponCardProps) {
  const { toast } = useToast();
  const { user } = useAuth(); // Get the user object
  const router = useRouter(); // Initialize router

  const handleGetCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: 'Code Copied!',
        description: `Coupon code "${code}" copied to clipboard.`,
      });
       // Track click if user is logged in
       if (user && coupon.storeId) {
        try {
          await trackClick({
            userId: user.uid,
            storeId: coupon.storeId,
            couponId: coupon.id, // Track the coupon ID
            timestamp: new Date(),
          });
          console.log(`Tracked click for coupon ${coupon.id} by user ${user.uid}`);
        } catch (trackError) {
          console.error("Error tracking coupon click:", trackError);
          // Don't block user flow for tracking errors
        }
      }
    } catch (err) {
      console.error('Failed to copy code:', err);
      toast({
        variant: 'destructive',
        title: 'Copy Failed',
        description: 'Could not copy the code. Please try again.',
      });
    }
  };

  const handleGetDeal = async () => {
    if (!coupon.link) {
      toast({
        variant: 'destructive',
        title: 'No Link',
        description: 'This deal does not have a specific link.',
      });
      return;
    }
    // Track click if user is logged in
     if (user && coupon.storeId) {
      try {
        await trackClick({
          userId: user.uid,
          storeId: coupon.storeId,
          couponId: coupon.id, // Track the coupon ID
          timestamp: new Date(),
        });
         console.log(`Tracked click for deal ${coupon.id} by user ${user.uid}`);
      } catch (trackError) {
        console.error("Error tracking deal click:", trackError);
        // Don't block user flow for tracking errors
      }
    }
    // Open the deal link in a new tab
    window.open(coupon.link, '_blank', 'noopener,noreferrer');
  };

   // Handle clicks on the main card content to redirect to store page
   const handleCardClick = (e: React.MouseEvent) => {
     // Prevent redirection if the click was on the button itself
     if ((e.target as HTMLElement).closest('button')) {
       return;
     }
     router.push(`/stores/${coupon.storeId}`);
   };

  const expiryDate = coupon.expiryDate ? new Date(coupon.expiryDate) : null;
  const isExpired = expiryDate ? expiryDate < new Date() : false;
  const storeName = coupon.store?.name ?? 'Store'; // Use store name if available
  const storeLogoUrl = coupon.store?.logoUrl ?? '/placeholder-logo.png'; // Use store logo if available

  return (
    <Card
      className={`flex flex-col justify-between border rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300 ${
        isExpired ? 'opacity-60 bg-muted/50' : ''
      }`}
      onClick={handleCardClick} // Add click handler to the card
      style={{ cursor: 'pointer' }} // Indicate clickable area
    >
      <CardHeader className="p-4 pb-2">
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
      </CardHeader>
      <CardContent className="p-4 pt-0 pb-2 flex-grow">
         {expiryDate && !isExpired && (
           <div className="flex items-center text-xs text-muted-foreground mb-2">
             <Clock className="w-3 h-3 mr-1" />
             Expires {formatDistanceToNow(expiryDate, { addSuffix: true })}
           </div>
         )}
         {/* Add any other relevant coupon details here */}
      </CardContent>
      <CardFooter className="p-4 pt-0 bg-muted/30 border-t">
        {coupon.code ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed border-primary text-primary hover:bg-primary/10 justify-between group"
            onClick={(e) => {
               e.stopPropagation(); // Prevent card click handler
               handleGetCode(coupon.code!);
            }}
            disabled={isExpired}
          >
             <span className="font-mono font-medium truncate">{coupon.code}</span>
             <span className="text-xs opacity-80 group-hover:opacity-100 transition-opacity">Copy Code</span>
          </Button>
        ) : coupon.link ? (
          <Button
             variant="default"
             size="sm"
             className="w-full bg-secondary hover:bg-secondary/90"
             onClick={(e) => {
                e.stopPropagation(); // Prevent card click handler
                handleGetDeal();
             }}
             disabled={isExpired}
           >
             Get Deal <ExternalLink className="w-4 h-4 ml-1" />
           </Button>
        ) : (
          <Button variant="secondary" size="sm" className="w-full" disabled>
            View Offer
          </Button> /* Placeholder if no code/link */
        )}
      </CardFooter>
    </Card>
  );
}

