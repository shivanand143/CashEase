
"use client";

import * as React from 'react';
import NextLink from 'next/link'; // Use NextLink for clarity
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
  // SheetTitle, // Using SheetTitle directly for the hidden title
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { SheetTitle, SheetDescription } from "@/components/ui/sheet"; // Ensure SheetTitle and SheetDescription are from ui/sheet

import { VisuallyHidden } from '@/components/ui/visually-hidden';
import {
    LogIn, LogOut, User, IndianRupee, ShoppingBag, LayoutDashboard, Settings, Menu,
    Tag, ShieldCheck, Gift, History, Send, X, List, HelpCircle, BookOpen, Search as SearchIcon, MousePointerClick, ReceiptText
} from 'lucide-react';
import { SidebarMenuButton } from '@/components/ui/sidebar-alt'; // For mobile menu items
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Separator } from "@/components/ui/separator";
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useToast } from '@/hooks/use-toast';

export default function Header() {
  const { user, userProfile, loading: authLoadingHook, signOut } = useAuth();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const router = useRouter();
  const isMobile = useIsMobile();
  const hasMounted = useHasMounted();
  const { toast } = useToast();

  const getInitials = (name?: string | null) => {
    if (!name) return 'MS';
    const parts = name.split(' ');
    if (parts.length > 1 && parts[0] && parts[parts.length - 1]) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const desktopNavLinks = [
    { href: "/stores", label: "Stores", icon: ShoppingBag },
    { href: "/coupons", label: "Coupons", icon: Tag },
    { href: "/categories", label: "Categories", icon: List },
    { href: "/how-it-works", label: "How It Works", icon: HelpCircle },
  ];

  const sheetNavLinks = [
    { href: "/", label: "Home", icon: ShoppingBag },
    { href: "/stores", label: "All Stores", icon: ShoppingBag },
    { href: "/coupons", label: "All Coupons", icon: Tag },
    { href: "/categories", label: "Categories", icon: List },
    { href: "/how-it-works", label: "How It Works", icon: HelpCircle },
    { href: "/blog", label: "Blog", icon: BookOpen },
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/contact", label: "Contact Us", icon: User },
  ];

  const userMenuItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/history", label: "Cashback History", icon: History },
    { href: "/dashboard/clicks", label: "Click History", icon: MousePointerClick },
    { href: "/dashboard/payout", label: "Request Payout", icon: Send },
    { href: "/dashboard/payout-history", label: "Payout History", icon: ReceiptText },
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
    setIsSheetOpen(false); // Close sheet on search submit
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm('');
  };

  const handleSheetLinkClick = () => {
      setIsSheetOpen(false);
  }
  const sheetTitleId = "mobile-main-menu-title";

  const handleSignOut = () => {
    if (typeof signOut === 'function') {
      signOut();
    } else {
      console.error("Header: signOut function is not available from useAuth.");
      toast({ variant: "destructive", title: "Logout Error", description: "Unable to logout at this moment. Please try again." });
    }
    setIsSheetOpen(false);
  };

  if (!hasMounted) {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4 md:px-6">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="mr-2 md:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <NextLink href="/" className="flex items-center space-x-2 mr-4">
              <IndianRupee className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl hidden sm:inline-block text-foreground">MagicSaver</span>
            </NextLink>
          </div>
          <div className="flex items-center space-x-2">
            <div className="hidden md:flex items-center space-x-1">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4 md:px-6">
        <div className="flex items-center">
          {isMobile && (
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="mr-2" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full max-w-xs p-0 flex flex-col bg-background">
                <VisuallyHidden><SheetTitle id={sheetTitleId}>Main Navigation Menu</SheetTitle></VisuallyHidden>
                <SheetHeader className="p-4 border-b flex flex-row items-center justify-between">
                    <NextLink href="/" className="flex items-center space-x-2" onClick={handleSheetLinkClick}>
                        <IndianRupee className="h-6 w-6 text-primary" />
                        <span className="font-bold text-lg text-foreground">MagicSaver</span>
                    </NextLink>
                    <SheetClose asChild>
                        <Button variant="ghost" size="icon" aria-label="Close menu"> <X className="h-5 w-5"/> </Button>
                    </SheetClose>
                </SheetHeader>
                <div className="flex-grow overflow-y-auto">
                  <nav className="flex flex-col space-y-1 p-4">
                    {sheetNavLinks.map((link) => (
                      <SidebarMenuButton
                        key={link.href}
                        href={link.href}
                        variant="ghost"
                        isActive={isActive(link.href)}
                        onClick={handleSheetLinkClick}
                        className="justify-start text-base"
                      >
                          {link.icon && <link.icon className="h-5 w-5" />}
                          {link.label}
                      </SidebarMenuButton>
                    ))}
                  </nav>
                  <Separator className="my-2" />
                  <div className="p-4 flex flex-col space-y-1">
                    {authLoadingHook ? (
                      <Skeleton className="h-10 w-full rounded-md" />
                    ) : user ? (
                      <>
                        {userMenuItems.map((item) => (
                           <SidebarMenuButton
                            key={item.href}
                            href={item.href}
                            variant="ghost"
                            isActive={isActive(item.href)}
                            onClick={handleSheetLinkClick}
                            className="justify-start text-base"
                          >
                            <item.icon className="h-5 w-5" />
                            {item.label}
                          </SidebarMenuButton>
                        ))}
                        {userProfile?.role === 'admin' && (
                           <SidebarMenuButton
                            href={adminMenuItem.href}
                            variant="ghost"
                            isActive={isActive(adminMenuItem.href)}
                            onClick={handleSheetLinkClick}
                            className="justify-start text-base"
                          >
                            <adminMenuItem.icon className="h-5 w-5" />
                            {adminMenuItem.label}
                          </SidebarMenuButton>
                        )}
                        <Separator className="my-2" />
                        <SidebarMenuButton variant="ghost" onClick={handleSignOut} className="w-full justify-start text-base">
                          <LogOut className="mr-3 h-5 w-5" /> Logout
                        </SidebarMenuButton>
                      </>
                    ) : (
                      <>
                        <SidebarMenuButton variant="ghost" onClick={() => {router.push('/login'); handleSheetLinkClick();}} className="w-full justify-start text-base">
                            <LogIn className="mr-3 h-5 w-5" /> Login
                        </SidebarMenuButton>
                        <SidebarMenuButton onClick={() => {router.push('/signup'); handleSheetLinkClick();}} className="w-full justify-center text-base">
                          Sign Up
                        </SidebarMenuButton>
                      </>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
          <NextLink href="/" className="flex items-center space-x-2 mr-4">
            <IndianRupee className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl hidden sm:inline-block text-foreground">MagicSaver</span>
          </NextLink>
        </div>

        {!isMobile && (
          <nav className="flex-1 flex justify-center items-center gap-1 lg:gap-2 text-sm font-medium">
              {desktopNavLinks.map((link) => (
                <Button
                  key={link.href}
                  variant="ghost"
                  asChild
                  className={cn(
                    "transition-colors hover:text-primary px-3 py-1.5 lg:px-4", // Adjusted padding
                    isActive(link.href) ? "text-primary font-semibold border-b-2 border-primary rounded-none" : "text-muted-foreground"
                  )}
                >
                  <NextLink href={link.href}>{link.label}</NextLink>
                </Button>
              ))}
            </nav>
        )}
        
        <div className="flex items-center space-x-1 md:space-x-2">
          {!isMobile && (
            <form onSubmit={handleSearchSubmit} className="w-full max-w-[150px] sm:max-w-xs relative hidden lg:block">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                type="search"
                name="search"
                placeholder="Search stores..."
                className="pl-8 w-full h-9 text-sm rounded-md"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </form>
          )}

          {!isMobile && (
            <div className="flex items-center space-x-1">
              {authLoadingHook ? (
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
                          <NextLink href={item.href}>
                          <item.icon className="mr-2 h-4 w-4" />
                          <span>{item.label}</span>
                          </NextLink>
                      </DropdownMenuItem>
                      ))}
                      {userProfile?.role === 'admin' && (
                      <DropdownMenuItem asChild>
                          <NextLink href={adminMenuItem.href}>
                          <adminMenuItem.icon className="mr-2 h-4 w-4" />
                          <span>{adminMenuItem.label}</span>
                          </NextLink>
                      </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
              ) : (
                  <>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/login')}>
                      Login
                  </Button>
                  <Button size="sm" onClick={() => router.push('/signup')}>
                      Sign Up
                  </Button>
                  </>
              )}
              </div>
          )}
        </div>
      </div>
    </header>
  );
}

    