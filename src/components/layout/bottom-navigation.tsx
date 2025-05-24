
"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingBag, Tag, Search, User, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth'; // To check if user is logged in for the "Account" link

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ href, icon: Icon, label, isActive }) => (
  <Link
    href={href}
    className={cn(
      "flex flex-col items-center justify-center flex-1 p-1 text-xs hover:text-primary transition-colors",
      isActive ? "text-primary" : "text-muted-foreground"
    )}
  >
    <Icon className="h-5 w-5 mb-0.5" strokeWidth={isActive ? 2.5 : 2} />
    <span>{label}</span>
  </Link>
);

export default function BottomNavigation() {
  const pathname = usePathname();
  const { user } = useAuth();

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/stores", label: "Stores", icon: ShoppingBag },
    { href: "/coupons", label: "Coupons", icon: Tag },
    { href: "/search", label: "Search", icon: Search },
    { href: user ? "/dashboard" : "/login", label: user ? "Account" : "Login", icon: user ? LayoutDashboard : User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border shadow-top-md z-40 flex items-center justify-around">
      {navItems.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={item.label}
          isActive={item.href === "/" ? pathname === item.href : pathname.startsWith(item.href)}
        />
      ))}
    </nav>
  );
}
