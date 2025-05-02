// src/components/ui/sidebar-alt.tsx
"use client"

// Alternative Sidebar Structure (more conventional for dashboard layouts)
// This provides a simpler structure focused on vertical navigation menus.
// It still relies on context for state management.

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { VariantProps, cva } from "class-variance-authority"
import { PanelLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"


const SIDEBAR_COOKIE_NAME = "sidebar_state_alt"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3.5rem" // Adjusted width for icon-only state
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextType = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextType | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      children,
      ...props
    },
    ref
  ) => {
    const isMobile = useIsMobile()
    const [openMobile, setOpenMobile] = React.useState(false)
    const [_open, _setOpen] = React.useState(() => {
      // Check cookie for initial state
       if (typeof window !== 'undefined') {
           const cookieValue = document.cookie
             .split('; ')
             .find(row => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
             ?.split('=')[1];
           return cookieValue ? cookieValue === 'true' : defaultOpen;
       }
       return defaultOpen;
    });

    const open = openProp ?? _open
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === "function" ? value(open) : value
        if (setOpenProp) {
          setOpenProp(openState)
        } else {
          _setOpen(openState)
        }
         if (typeof window !== 'undefined') {
             document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
         }
      },
      [setOpenProp, open]
    )

    const toggleSidebar = React.useCallback(() => {
      return isMobile
        ? setOpenMobile((open) => !open)
        : setOpen((open) => !open)
    }, [isMobile, setOpen, setOpenMobile])

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault()
          toggleSidebar()
        }
      }
      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }, [toggleSidebar])

    const state = open ? "expanded" : "collapsed"

    const contextValue = React.useMemo<SidebarContextType>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
    )

    return (
      <SidebarContext.Provider value={contextValue}>
        <TooltipProvider delayDuration={0}>
           <div ref={ref} {...props}>
              {children}
           </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    )
  }
)
SidebarProvider.displayName = "SidebarProvider"


export const Sidebar = React.forwardRef<
  HTMLElement, // Changed to HTMLElement for semantic correctness (aside)
  React.ComponentProps<"aside"> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" // Removed 'inset' as it complicates this simpler structure
    collapsible?: "icon" | "offcanvas" | "none"
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "icon",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

    if (collapsible === "none") {
       return (
         <aside
           ref={ref}
           className={cn(
             "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground",
             `w-[${SIDEBAR_WIDTH}]`, // Use template literal for dynamic width
             className
           )}
           {...props}
         >
           {children}
         </aside>
       )
    }

    if (isMobile) {
       return (
         <Sheet open={openMobile} onOpenChange={setOpenMobile}>
           <SheetTrigger asChild>
             {/* Consider adding a visible trigger button in the mobile header */}
             <button className="sr-only">Open Sidebar</button>
           </SheetTrigger>
           <SheetContent
             side={side}
             className={cn("w-[--sidebar-width-mobile] bg-sidebar p-0 text-sidebar-foreground flex flex-col", className)}
              style={{ '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
             {...props} // Pass other props like `ref` if needed by SheetContent
           >
             {children} {/* Render sidebar content inside the sheet */}
           </SheetContent>
         </Sheet>
       )
    }

    // Desktop Sidebar
    return (
       <aside
          ref={ref}
          data-state={state}
          data-collapsible={collapsible === 'icon' && state === 'collapsed'}
          className={cn(
             "hidden md:flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out",
             variant === "sidebar" && (side === 'left' ? "border-r" : "border-l"),
             variant === "floating" && "m-2 rounded-lg border shadow-sm",
             state === 'expanded' ? `w-[${SIDEBAR_WIDTH}]` : (collapsible === 'icon' ? `w-[${SIDEBAR_WIDTH_ICON}]` : 'w-0 border-none'), // Adjust width based on state and collapsible type
             collapsible === 'offcanvas' && state === 'collapsed' && 'absolute z-40', // Handle offcanvas positioning
             collapsible === 'offcanvas' && side === 'left' && state === 'collapsed' && '-translate-x-full',
             collapsible === 'offcanvas' && side === 'right' && state === 'collapsed' && 'translate-x-full',
             className
          )}
          style={{
             '--sidebar-width': SIDEBAR_WIDTH,
             '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
             '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
           } as React.CSSProperties}
          {...props}
        >
          {children}
        </aside>
    )
  }
)
Sidebar.displayName = "Sidebar"


// Simple structural components
export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("flex h-14 items-center border-b px-4 shrink-0", className)} {...props} />
    )
);
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("flex-1 overflow-y-auto overflow-x-hidden", className)} {...props} />
    )
);
SidebarContent.displayName = "SidebarContent";

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("border-t p-2 shrink-0", className)} {...props} />
    )
);
SidebarFooter.displayName = "SidebarFooter";


// Navigation Menu Components
export const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
    ({ className, ...props }, ref) => (
        <ul ref={ref} className={cn("space-y-1", className)} {...props} />
    )
);
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
    ({ className, ...props }, ref) => (
        <li ref={ref} className={cn("relative", className)} {...props} />
    )
);
SidebarMenuItem.displayName = "SidebarMenuItem";


// Sidebar Menu Button (Link or Button)
const sidebarMenuButtonVariants = cva(
  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors justify-start", // Adjusted gap and added justify-start
  {
    variants: {
      isActive: {
        true: "bg-sidebar-accent text-sidebar-accent-foreground",
        false: "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
      },
      isCollapsed: { // Variant for collapsed state styling
        true: "!px-0 !py-2 justify-center [&>span]:hidden", // Center icon, hide text
         false: ""
      }
    },
    defaultVariants: {
      isActive: false,
      isCollapsed: false
    },
  }
)

export const SidebarMenuButton = React.forwardRef<
    HTMLButtonElement | HTMLAnchorElement, // Can be button or anchor
    (React.ComponentProps<"button"> | React.ComponentProps<"a">) & {
        asChild?: boolean
        isActive?: boolean
        tooltip?: string
    } & VariantProps<typeof sidebarMenuButtonVariants>
>(
    ({ asChild = false, isActive, tooltip, className, children, ...props }, ref) => {
       const Comp = asChild ? Slot : (props.href ? "a" : "button") as any; // Determine element based on href
        const { state: sidebarState, isMobile } = useSidebar();
        const isCollapsed = sidebarState === 'collapsed' && !isMobile;

        const buttonContent = (
           <Comp
              ref={ref}
              className={cn(sidebarMenuButtonVariants({ isActive, isCollapsed }), className)} // Apply collapsed variant
              data-active={isActive}
              {...props}
            >
              {children}
            </Comp>
        );

        if (isCollapsed && tooltip) {
            return (
                <Tooltip>
                    <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                    <TooltipContent side="right" align="center">
                       {tooltip}
                    </TooltipContent>
                </Tooltip>
            );
        }

        return buttonContent;
    }
);
SidebarMenuButton.displayName = "SidebarMenuButton";


// --- Re-added components from the original file, simplified or adapted ---

// Keep Toggle Button for explicit control if needed outside of shortcuts/gestures
export const SidebarToggleButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  const { toggleSidebar, isMobile } = useSidebar();

  if (isMobile) {
      // Use SheetTrigger on mobile
      return (
           <SheetTrigger asChild>
               <Button
                 ref={ref}
                 variant="ghost"
                 size="icon"
                 className={cn("md:hidden", className)} // Only show on mobile
                 {...props}
               >
                 <PanelLeft />
                 <span className="sr-only">Toggle Sidebar</span>
               </Button>
           </SheetTrigger>
       );
  }

  // Standard button for desktop
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn("hidden md:inline-flex", className)} // Only show on desktop
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
SidebarToggleButton.displayName = "SidebarToggleButton"


// Simplified Grouping (optional visual separators/labels)
export const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("p-2", className)} {...props} />
    )
);
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => {
       const { state: sidebarState, isMobile } = useSidebar();
       const isCollapsed = sidebarState === 'collapsed' && !isMobile;

       if (isCollapsed) return null; // Don't render label when collapsed

       return (
          <div
            ref={ref}
            className={cn(
              "px-3 py-2 text-xs font-semibold uppercase text-sidebar-foreground/70 tracking-wider",
              className
            )}
            {...props}
          >
            {children}
          </div>
        )
     }
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";


// --- Potentially useful but more complex components (keep if needed) ---
// These add submenus but increase complexity.

export const SidebarSection = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { title?: string }
>(({ className, title, children, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-1", className)} {...props}>
    {title && (
      <h4 className="px-3 py-2 text-xs font-semibold text-muted-foreground">
        {title}
      </h4>
    )}
    {children}
  </div>
))
SidebarSection.displayName = "SidebarSection"

export const SidebarTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold text-foreground px-3",
      className
    )}
    {...props}
  />
))
SidebarTitle.displayName = "SidebarTitle"

// For nested menus (Consider using Radix Collapsible for this)
export const SidebarSubmenu = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("ml-4 space-y-1 border-l pl-4", className)} {...props} />
))
SidebarSubmenu.displayName = "SidebarSubmenu"

export const SidebarSubmenuItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} /> // Minimal styling for list item
))
SidebarSubmenuItem.displayName = "SidebarSubmenuItem"

export const SidebarSubmenuButton = React.forwardRef<
    HTMLAnchorElement, // Typically links
    React.ComponentProps<"a"> & { isActive?: boolean }
>(({ className, isActive, ...props }, ref) => (
  <a
    ref={ref}
    className={cn(
      "block rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      isActive ? "text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80",
      className
    )}
    {...props}
  />
));
SidebarSubmenuButton.displayName = "SidebarSubmenuButton";


// Keep SidebarItem as a general purpose container if needed, though MenuItem might suffice
export const SidebarItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-1", className)} {...props} />
))
SidebarItem.displayName = "SidebarItem"
