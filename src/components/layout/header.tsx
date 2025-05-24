
"use client";

import * as React from 'react';
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
    LogIn, LogOut, User, IndianRupee, ShoppingBag, LayoutDashboard, Settings, Menu,
    Tag, ShieldCheck, Gift, History, Send, X, List, HelpCircle, BookOpen, Search as SearchIcon, Home // Added Home for sheet
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Separator } from "@/components/ui/separator";
import { Input } from '@/components/ui/input';
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { useIsMobile } from '@/hooks/use-mobile';


export default function Header() {
  const { user, userProfile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const router = useRouter();
  const isMobile = useIsMobile();


  const getInitials = (name?: string | null) => {
    if (!name) return 'MS'; // MagicSaver initials
    const parts = name.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Desktop navigation links (some might be in bottom nav for mobile)
  const desktopNavLinks = [
    { href: "/stores", label: "Stores", icon: ShoppingBag },
    { href: "/coupons", label: "Coupons", icon: Tag },
    { href: "/categories", label: "Categories", icon: List },
    { href: "/how-it-works", label: "How It Works", icon: HelpCircle },
  ];

  // Links for the mobile sheet (drawer)
  // Combines some desktop links and footer links
  const sheetNavLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/stores", label: "All Stores", icon: ShoppingBag },
    { href: "/coupons", label: "All Coupons", icon: Tag },
    { href: "/categories", label: "Categories", icon: List },
    { href: "/how-it-works", label: "How It Works", icon: HelpCircle },
    { href: "/blog", label: "Blog", icon: BookOpen },
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/contact", label: "Contact Us", icon: User }, // User icon can be generic contact
  ];

  const userMenuItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/history", label: "Cashback History", icon: History },
    { href: "/dashboard/payout", label: "Request Payout", icon: Send },
    { href: "/dashboard/referrals", label: "Refer & Earn", icon: Gift },
    { href: "/dashboard/settings", label: "Account Settings", icon: Settings },
  ];

  const adminMenuItem = { href: "/admin", label: "Admin Panel", icon: ShieldCheck };

  const isActive = (href: string) => {
    if (href === "/") return pathname === href;
    return pathname.startsWith(href);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;
    setIsSheetOpen(false); 
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm(''); 
  };

  const handleSheetLinkClick = () => {
      setIsSheetOpen(false); 
  }
  const sheetTitleId = "mobile-main-menu-title";


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4 md:px-6"> {/* Reduced height */}
        {/* Left Side: Mobile Menu Trigger & Logo */}
        <div className="flex items-center">
          {/* Mobile Menu Trigger */}
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden mr-2">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full max-w-xs p-0 flex flex-col bg-background">
              <VisuallyHidden>
                  <SheetTitle id={sheetTitleId}>Main Navigation Menu</SheetTitle>
              </VisuallyHidden>
              <SheetHeader className="p-4 border-b flex flex-row items-center justify-between">
                <Link href="/" className="flex items-center space-x-2" onClick={handleSheetLinkClick}>
                  <IndianRupee className="h-6 w-6 text-primary" />
                  <span className="font-bold text-lg text-foreground">MagicSaver</span>
                </Link>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon">
                    <X className="h-5 w-5" />
                    <span className="sr-only">Close Menu</span>
                  </Button>
                </SheetClose>
              </SheetHeader>
              
              {/* Mobile Drawer Content - Search is now in bottom nav for mobile */}
              <div className="flex-grow overflow-y-auto">
                <nav className="flex flex-col space-y-1 p-4">
                  {sheetNavLinks.map((link) => (
                    <SheetClose key={link.href} asChild>
                      <Link
                        href={link.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors hover:bg-muted",
                          isActive(link.href) ? "bg-muted text-primary" : "text-foreground"
                        )}
                        onClick={handleSheetLinkClick}
                      >
                        {link.icon && <link.icon className="h-5 w-5" />}
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                <Separator className="my-2" />
                {/* Mobile Auth/User Menu */}
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
                              "flex items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors hover:bg-muted",
                              isActive(item.href) ? "bg-muted text-primary" : "text-foreground"
                            )}
                            onClick={handleSheetLinkClick}
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
                              "flex items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors hover:bg-muted",
                              isActive(adminMenuItem.href) ? "bg-muted text-primary" : "text-foreground"
                            )}
                             onClick={handleSheetLinkClick}
                          >
                            <adminMenuItem.icon className="h-5 w-5" />
                            {adminMenuItem.label}
                          </Link>
                        </SheetClose>
                      )}
                      <Separator className="my-2" />
                      <Button variant="ghost" onClick={() => { signOut(); setIsSheetOpen(false); }} className="w-full justify-start px-3 py-2.5 text-base font-medium">
                        <LogOut className="mr-3 h-5 w-5" /> Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <SheetClose asChild>
                        <Button variant="ghost" asChild className="w-full justify-start px-3 py-2.5 text-base font-medium">
                          <Link href="/login" onClick={handleSheetLinkClick}>
                            <LogIn className="mr-3 h-5 w-5" /> Login
                          </Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button asChild className="w-full justify-center px-3 py-2.5 text-base font-medium">
                          <Link href="/signup" onClick={handleSheetLinkClick}>Sign Up</Link>
                        </Button>
                      </SheetClose>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 mr-4">
            <IndianRupee className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl hidden sm:inline-block text-foreground">MagicSaver</span>
          </Link>
        </div>

        {/* Center: Desktop Navigation */}
        <nav className="flex-1 hidden md:flex justify-center items-center gap-6 text-sm font-medium">
            {desktopNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors hover:text-primary py-1",
                  isActive(link.href) ? "text-primary font-semibold border-b-2 border-primary" : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        
        {/* Right Side: Desktop Search & Auth actions */}
        <div className="flex items-center space-x-2">
           {/* Desktop Search - only show if not mobile, or integrate differently for app feel */}
          {!isMobile && (
            <form onSubmit={handleSearchSubmit} className="w-full max-w-xs relative hidden lg:block">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                type="search"
                placeholder="Search stores..."
                className="pl-8 w-full h-9 text-sm rounded-md"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </form>
          )}

          {/* Auth Actions - hidden on mobile as they are in sheet/bottom nav */}
          <div className="hidden md:flex items-center space-x-1">
            {loading ? (
                <Skeleton className="h-9 w-9 rounded-full" />
            ) : user ? (
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9 border">
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
                <>
                <Button variant="ghost" asChild size="sm">
                    <Link href="/login">Login</Link>
                </Button>
                <Button asChild size="sm">
                    <Link href="/signup">Sign Up</Link>
                </Button>
                </>
            )}
            </div>
        </div>
      </div>
    </header>
  );
}
