// src/components/layout/header.tsx
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogIn, LogOut, User, DollarSign, ShoppingBag, LayoutDashboard, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function Header() {
  const { user, userProfile, loading, signOut } = useAuth();

  const getInitials = (name?: string | null) => {
    if (!name) return 'CE'; // CashEase initials
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <DollarSign className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">CashEase</span>
        </Link>
        <nav className="flex items-center space-x-6 text-sm font-medium flex-grow">
          <Link
            href="/stores"
            className="transition-colors hover:text-primary"
          >
            Stores
          </Link>
          <Link
            href="/coupons"
            className="transition-colors hover:text-primary"
          >
            Coupons
          </Link>
          {/* Add more nav links as needed */}
        </nav>

        <div className="flex items-center space-x-4">
          {loading ? (
            <Skeleton className="h-8 w-20 rounded-md" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={userProfile?.photoURL ?? undefined} alt={userProfile?.displayName ?? 'User'} />
                    <AvatarFallback>{getInitials(userProfile?.displayName)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userProfile?.displayName ?? user.email}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                     {userProfile && (
                      <p className="text-xs leading-none text-muted-foreground pt-1">
                        Balance: ${userProfile.cashbackBalance.toFixed(2)}
                      </p>
                     )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                 <DropdownMenuItem asChild>
                   <Link href="/dashboard">
                     <LayoutDashboard className="mr-2 h-4 w-4" />
                     <span>Dashboard</span>
                   </Link>
                 </DropdownMenuItem>
                 <DropdownMenuItem asChild>
                   <Link href="/dashboard/settings">
                     <Settings className="mr-2 h-4 w-4" />
                     <span>Settings</span>
                   </Link>
                 </DropdownMenuItem>
                 {userProfile?.role === 'admin' && (
                   <DropdownMenuItem asChild>
                     <Link href="/admin">
                       <User className="mr-2 h-4 w-4" />
                       <span>Admin Panel</span>
                     </Link>
                   </DropdownMenuItem>
                 )}
                 <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" /> Login
                </Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
