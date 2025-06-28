
import type { Store } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IndianRupee, Percent } from 'lucide-react';

interface StoreCardProps {
  store: Store;
}

export default function StoreCard({ store }: StoreCardProps) {
  return (
    <Card className="flex flex-col items-center justify-between h-full text-center p-0 border hover:shadow-lg transition-shadow duration-300 rounded-lg overflow-hidden group">
      <Link href={`/stores/${store.id}`} className="flex flex-col items-center justify-center p-4 flex-grow w-full">
        <div className="relative w-full h-16 mb-3 flex items-center justify-center">
            {store.logoUrl ? (
            <Image
                src={store.logoUrl}
                alt={`${store.name} Logo`}
                fill
                sizes="(max-width: 768px) 30vw, 15vw"
                className="object-contain transition-transform duration-300 group-hover:scale-105"
                data-ai-hint={store.dataAiHint || `${store.name} logo`}
            />
            ) : (
            <div className="h-full w-full bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs p-2">
                {store.name}
            </div>
            )}
        </div>
        <p className="font-semibold text-base mb-1 truncate w-full" title={store.name}>{store.name}</p>
        <p className="text-sm text-primary font-medium flex items-center justify-center gap-1">
          {store.cashbackType === 'fixed' ? <IndianRupee className="w-3.5 h-3.5" /> : <Percent className="w-3.5 h-3.5" />}
          {store.cashbackRate}
        </p>
      </Link>
      <CardFooter className="p-2 w-full bg-muted/30 border-t">
        <Button variant="ghost" size="sm" className="w-full text-primary hover:bg-primary/10" asChild>
          <Link href={`/stores/${store.id}`}>Visit Store</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
