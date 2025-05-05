
import type { Store } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IndianRupee } from 'lucide-react';

interface StoreCardProps {
  store: Store;
}

export default function StoreCard({ store }: StoreCardProps) {
  return (
    <Card className="flex flex-col items-center justify-between h-full text-center p-0 border hover:shadow-lg transition-shadow duration-300 rounded-lg overflow-hidden">
      <Link href={`/stores/${store.id}`} className="flex flex-col items-center justify-center p-4 flex-grow w-full">
        {store.logoUrl ? (
          <Image
            src={store.logoUrl}
            alt={`${store.name} Logo`}
            width={120} // Increased size
            height={60} // Increased size
            className="object-contain mb-3 h-[60px] w-auto max-w-[120px]"
            data-ai-hint={store.dataAiHint || `${store.name} logo`}
          />
        ) : (
          <div className="h-[60px] w-[120px] bg-muted rounded-md mb-3 flex items-center justify-center text-muted-foreground text-xs">
            No Logo
          </div>
        )}
        <p className="font-semibold text-base mb-1 truncate w-full">{store.name}</p>
        <p className="text-sm text-primary font-medium flex items-center justify-center gap-1">
          {/* Optional: Icon based on cashback type */}
          {store.cashbackType === 'fixed' && <IndianRupee className="w-3.5 h-3.5" />}
          {store.cashbackRate}
        </p>
      </Link>
      <CardFooter className="p-2 w-full bg-muted/50 border-t">
        <Button variant="ghost" size="sm" className="w-full text-primary hover:bg-primary/10" asChild>
          <Link href={`/stores/${store.id}`}>Visit Store</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
