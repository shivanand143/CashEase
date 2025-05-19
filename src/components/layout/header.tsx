
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
    Tag, ShieldCheck, Gift, History, Send, X, List, HelpCircle, BookOpen, Search as SearchIcon
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Separator } from "@/components/ui/separator";
import { Input } from '@/components/ui/input';
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"


export default function Header() {
  const { user, userProfile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isSheetOpen, setIsSheetOpen] = React.useState(false); // State for mobile sheet
  const router = useRouter();

  const getInitials = (name?: string | null) => {
    if (!name) return 'MS'; // MagicSaver initials
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const navLinks = [
    { href: "/stores", label: "Stores", icon: ShoppingBag },
    { href: "/coupons", label: "Coupons", icon: Tag },
    { href: "/categories", label: "Categories", icon: List },
    // { href: "/blog", label: "Blog", icon: BookOpen }, // Temporarily hide blog
    { href: "/how-it-works", label: "How It Works", icon: HelpCircle },
  ];

  const userMenuItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/history", label: "Cashback History", icon: History },
    { href: "/dashboard/payout", label: "Payout", icon: Send },
    { href: "/dashboard/referrals", label: "Referrals", icon: Gift },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  const adminMenuItem = { href: "/admin", label: "Admin Panel", icon: ShieldCheck };

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;
    setIsSheetOpen(false); // Close sheet on search submit
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm(''); // Clear search term
  };

  const handleSheetLinkClick = () => {
      setIsSheetOpen(false); // Close sheet when a link inside is clicked
  }
  const titleId = "sheet-title-id";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4 md:px-6">
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
            <SheetContent side="left" className="w-full max-w-xs p-0 flex flex-col">
              <VisuallyHidden>
                  <SheetTitle id={titleId}>Main Navigation Menu</SheetTitle>
              </VisuallyHidden>
              <SheetHeader className="p-4 border-b flex flex-row items-center justify-between">
                 {/* Add title for accessibility */}
                 <SheetTitle className="sr-only">Main Menu</SheetTitle>
                <Link href="/" className="flex items-center space-x-2" onClick={handleSheetLinkClick}>
                  <IndianRupee className="h-6 w-6 text-primary" />
                  <span className="font-bold text-lg">MagicSaver</span>
                </Link>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon">
                    <X className="h-5 w-5" />
                    <span className="sr-only">Close Menu</span>
                  </Button>
                </SheetClose>
              </SheetHeader>
              {/* Mobile Search */}
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
              {/* Mobile Navigation */}
              <div className="flex-grow overflow-y-auto">
                <nav className="flex flex-col space-y-1 p-4">
                  {navLinks.map((link) => (
                    <SheetClose key={link.href} asChild>
                      <Link
                        href={link.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted",
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
                              "flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted",
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
                              "flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted",
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
                      <Button variant="ghost" onClick={() => { signOut(); setIsSheetOpen(false); }} className="w-full justify-start px-3 py-2 text-base font-medium">
                        <LogOut className="mr-3 h-5 w-5" /> Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <SheetClose asChild>
                        <Button variant="ghost" asChild className="w-full justify-start px-3 py-2 text-base font-medium">
                          <Link href="/login" onClick={handleSheetLinkClick}>
                            <LogIn className="mr-3 h-5 w-5" /> Login
                          </Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button asChild className="w-full justify-center px-3 py-2 text-base font-medium">
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
            <span className="font-bold text-xl hidden sm:inline-block">MagicSaver</span>
          </Link>
        </div>

        {/* Center: Desktop Navigation & Search */}
        <div className="flex-1 hidden md:flex justify-center items-center gap-6">
          <nav className="flex items-center space-x-4 lg:space-x-6 text-sm font-medium">
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
          {/* Desktop Search */}
          <form onSubmit={handleSearchSubmit} className="w-full max-w-xs relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="pl-9 w-full h-9 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </form>
        </div>

        {/* Right Side: Auth actions */}
        <div className="flex items-center space-x-2">
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
            <div className="hidden md:flex items-center space-x-1">
              <Button variant="ghost" asChild size="sm">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Sign Up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
