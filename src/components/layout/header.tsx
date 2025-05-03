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
import {
  Sheet,
  SheetContent,
  SheetHeader, // Import SheetHeader
  SheetTitle, // Import SheetTitle
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"; // Import Sheet components for mobile menu
import { LogIn, LogOut, User, IndianRupee, ShoppingBag, LayoutDashboard, Settings, Menu, Home, Tag, ShieldCheck, Gift, History, Send, X, List, HelpCircle, BookOpen, Search as SearchIcon } from 'lucide-react'; // Added icons for new sections
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathname } from 'next/navigation'; // Import usePathname
import { cn } from '@/lib/utils'; // Import cn utility
import { Separator } from "@/components/ui/separator";
import { Input } from '@/components/ui/input'; // Import Input for search
import * as React from 'react'; // Import React for state
import { useRouter } from 'next/navigation'; // Use Next.js router

export default function Header() {
  const { user, userProfile, loading, signOut } = useAuth();
  const pathname = usePathname(); // Get current path
   const [searchTerm, setSearchTerm] = React.useState('');
   const router = useRouter(); // Use Next.js router

  const getInitials = (name?: string | null) => {
    if (!name) return 'CE'; // CashEase initials
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const navLinks = [
    { href: "/stores", label: "Stores", icon: ShoppingBag },
    { href: "/coupons", label: "Coupons", icon: Tag },
    { href: "/categories", label: "Categories", icon: List }, // Added Categories
    { href: "/blog", label: "Blog", icon: BookOpen },         // Added Blog
    { href: "/faq", label: "FAQ", icon: HelpCircle },         // Added FAQ
    // { href: "/amazon-deals", label: "Amazon Deals", icon: null }, // Example, add icon if needed
    // Add more primary navigation links here
  ];

  const userMenuItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/history", label: "Cashback History", icon: History },
    { href: "/dashboard/payout", label: "Payout", icon: Send },
    { href: "/dashboard/referrals", label: "Referrals", icon: Gift },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

   const adminMenuItem = { href: "/admin", label: "Admin Panel", icon: ShieldCheck };

  // Helper function to check if a link is active
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href)); // Adjusted for better active state matching

  const handleSearchSubmit = (event: React.FormEvent) => {
      event.preventDefault();
      if (!searchTerm.trim()) return;
      // Navigate to search page with query parameter using Next.js router
      router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
   };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between gap-4">
        {/* Mobile Menu Trigger (keep on left) */}
        <div className="flex items-center md:hidden">
           <Sheet>
               <SheetTrigger asChild>
                   <Button variant="ghost" size="icon">
                       <Menu className="h-5 w-5" />
                       <span className="sr-only">Toggle Menu</span>
                   </Button>
               </SheetTrigger>
               <SheetContent side="left" className="w-full max-w-xs p-0 flex flex-col">
                   <SheetHeader className="p-4 border-b flex flex-row items-center justify-between">
                       <Link href="/" className="flex items-center space-x-2">
                           <IndianRupee className="h-6 w-6 text-primary" />
                           <span className="font-bold text-xl">CashEase</span>
                       </Link>
                        <SheetClose asChild>
                          <Button variant="ghost" size="icon">
                             <X className="h-5 w-5" />
                             <span className="sr-only">Close Menu</span>
                           </Button>
                        </SheetClose>
                   </SheetHeader>
                    {/* Mobile Search Bar */}
                    <form onSubmit={handleSearchSubmit} className="p-4 border-b">
                         <div className="relative">
                           <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                           <Input
                              type="search"
                              placeholder="Search stores, coupons..."
                              className="pl-9 w-full h-9"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                           />
                         </div>
                     </form>
                    <div className="flex-grow flex flex-col overflow-y-auto">
                        <nav className="flex flex-col space-y-1 p-4">
                            {navLinks.map((link) => (
                                <SheetClose key={link.href} asChild>
                                    <Link
                                        href={link.href}
                                        className={cn(
                                            "flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted",
                                            isActive(link.href) ? "bg-muted text-primary" : "text-foreground"
                                        )}
                                    >
                                         {link.icon && <link.icon className="h-5 w-5" />}
                                        {link.label}
                                    </Link>
                                </SheetClose>
                            ))}
                        </nav>
                         <Separator className="my-2"/>
                         <div className="p-4 flex flex-col space-y-1">
                             {loading ? (
                                 <Skeleton className="h-10 w-full rounded-md" />
                             ) : user ? (
                                 <>
                                     {userMenuItems.map((item) => (
                                         <SheetClose key={item.href} asChild>
                                            <Link
                                                href={item.href}
                                                className={cn(
                                                   "flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted",
                                                   isActive(item.href) ? "bg-muted text-primary" : "text-foreground"
                                                 )}
                                             >
                                                <item.icon className="h-5 w-5" />
                                                {item.label}
                                            </Link>
                                         </SheetClose>
                                     ))}
                                      {userProfile?.role === 'admin' && (
                                          <SheetClose asChild>
                                              <Link
                                                  href={adminMenuItem.href}
                                                   className={cn(
                                                    "flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted",
                                                    isActive(adminMenuItem.href) ? "bg-muted text-primary" : "text-foreground"
                                                  )}
                                              >
                                                  <adminMenuItem.icon className="h-5 w-5" />
                                                  {adminMenuItem.label}
                                              </Link>
                                          </SheetClose>
                                      )}
                                     <Separator className="my-2"/>
                                     <Button variant="ghost" onClick={signOut} className="w-full justify-start px-3 py-2 text-base font-medium">
                                         <LogOut className="mr-3 h-5 w-5" /> Logout
                                     </Button>
                                 </>
                             ) : (
                                 <>
                                     <SheetClose asChild>
                                        <Button variant="ghost" asChild className="w-full justify-start px-3 py-2 text-base font-medium">
                                            <Link href="/login">
                                               <LogIn className="mr-3 h-5 w-5" /> Login
                                            </Link>
                                        </Button>
                                     </SheetClose>
                                     <SheetClose asChild>
                                        <Button asChild className="w-full justify-center px-3 py-2 text-base font-medium">
                                           <Link href="/signup">Sign Up</Link>
                                        </Button>
                                     </SheetClose>
                                 </>
                             )}
                         </div>
                    </div>
               </SheetContent>
           </Sheet>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-4 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "transition-colors hover:text-primary",
                isActive(link.href) ? "text-primary font-semibold" : "text-muted-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Search Bar - Centered on Desktop */}
         <div className="flex-1 hidden md:flex justify-center px-4">
             <form onSubmit={handleSearchSubmit} className="w-full max-w-md relative">
                 <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input
                    type="search"
                    placeholder="Search stores, coupons, categories..."
                    className="pl-9 w-full h-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                 />
             </form>
         </div>

        {/* Right side: Auth actions & Logo */}
        <div className="flex items-center space-x-2">
           {loading ? (
               <Skeleton className="h-8 w-8 rounded-full" />
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
                     <p className="text-sm font-medium leading-none truncate">{userProfile?.displayName ?? user.email}</p>
                     <p className="text-xs leading-none text-muted-foreground truncate">
                       {user.email}
                     </p>
                      {userProfile && (
                       <p className="text-xs leading-none text-muted-foreground pt-1">
                         Balance: ₹{userProfile.cashbackBalance.toFixed(2)}
                       </p>
                      )}
                   </div>
                 </DropdownMenuLabel>
                 <DropdownMenuSeparator />
                  {userMenuItems.map((item) => (
                     <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href}>
                           <item.icon className="mr-2 h-4 w-4" />
                           <span>{item.label}</span>
                        </Link>
                     </DropdownMenuItem>
                  ))}
                  {userProfile?.role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link href={adminMenuItem.href}>
                        <adminMenuItem.icon className="mr-2 h-4 w-4" />
                        <span>{adminMenuItem.label}</span>
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
             <div className="hidden md:flex items-center space-x-2"> {/* Hide on mobile, show on desktop */}
               <Button variant="ghost" asChild>
                 <Link href="/login">
                   <LogIn className="mr-2 h-4 w-4" /> Login
                 </Link>
               </Button>
               <Button asChild>
                 <Link href="/signup">Sign Up</Link>
               </Button>
             </div>
           )}
           {/* Logo/Name moved to the right */}
            <Link href="/" className="ml-4 flex items-center space-x-2">
                <IndianRupee className="h-6 w-6 text-primary" />
                <span className="font-bold text-xl hidden sm:inline-block">CashEase</span>
            </Link>
        </div>
      </div>
    </header>
  );
}
