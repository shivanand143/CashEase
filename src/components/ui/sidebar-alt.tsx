
"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { VariantProps, cva } from "class-variance-authority"
import { PanelLeft, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet" // Import SheetClose

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
  HTMLElement, // Changed to HTMLElement (aside)
  React.ComponentProps<"aside"> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating"
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
             `w-[${SIDEBAR_WIDTH}]`,
             className
           )}
           {...props}
         >
           {children}
         </aside>
       )
    }

    // Mobile Sheet Sidebar
    if (isMobile) {
       return (
         <Sheet open={openMobile} onOpenChange={setOpenMobile}>
           {/* Trigger is typically in the Header, not rendered here directly */}
           <SheetContent
             side={side}
             className={cn(
                "w-[--sidebar-width-mobile] bg-sidebar p-0 text-sidebar-foreground flex flex-col",
                className
             )}
             style={{ '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
             // Remove the default close button provided by SheetContent if you have one in Header
             // showCloseButton={false} // Assuming SheetContent might have such a prop, otherwise manage via styling/structure
             {...props} // Pass other props like `ref` if needed
           >
             {/* Add a header section inside the SheetContent if needed */}
             {/* <div className="flex items-center justify-between p-4 border-b">
               <SheetTitle>Menu</SheetTitle>
               <SheetClose asChild>
                 <Button variant="ghost" size="icon"> <X className="h-4 w-4"/> </Button>
               </SheetClose>
             </div> */}
             {children}
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
             state === 'expanded' ? `w-[${SIDEBAR_WIDTH}]` : (collapsible === 'icon' ? `w-[${SIDEBAR_WIDTH_ICON}]` : 'w-0 border-none'),
             collapsible === 'offcanvas' && state === 'collapsed' && 'absolute z-40',
             collapsible === 'offcanvas' && side === 'left' && state === 'collapsed' && '-translate-x-full',
             collapsible === 'offcanvas' && side === 'right' && state === 'collapsed' && 'translate-x-full',
             className
          )}
          style={{
             '--sidebar-width': SIDEBAR_WIDTH,
             '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
           } as React.CSSProperties}
          {...props}
        >
          {children}
        </aside>
    )
  }
)
Sidebar.displayName = "Sidebar"


// Structural components
export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("flex h-16 items-center border-b px-4 shrink-0", className)} {...props} /> // Increased height
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

// Sidebar Menu Button
const sidebarMenuButtonVariants = cva(
  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors justify-start",
  {
    variants: {
      variant: { // Add variant definitions here if they are different from standard Button
        default: "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
        ghost: "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
        // Add other variants if needed, or ensure they match the standard Button variants
      },
      size: { // Add size definitions if they are different from standard Button
        default: "h-10", // Example size
        sm: "h-9",
        lg: "h-11",
        icon: "h-10 w-10 !p-0 justify-center [&>svg]:!mr-0",
      },
      isActive: {
        true: "bg-sidebar-accent text-sidebar-accent-foreground",
        false: "", // Base styling for non-active comes from variant
      },
      isCollapsed: {
        true: "!p-2 justify-center [&>span]:hidden [&>svg]:mr-0", // Adjust padding for icons
         false: ""
      }
    },
    compoundVariants: [
      {
        isActive: false,
        variant: "default",
        className: "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
      },
      {
        isActive: false,
        variant: "ghost",
        className: "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
      }
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      isActive: false,
      isCollapsed: false
    },
  }
)

export const SidebarMenuButton = React.forwardRef<
    HTMLButtonElement | HTMLAnchorElement,
    (React.ButtonHTMLAttributes<HTMLButtonElement> | React.AnchorHTMLAttributes<HTMLAnchorElement>) & {
        asChild?: boolean
        isActive?: boolean
        tooltip?: string
    } & VariantProps<typeof sidebarMenuButtonVariants> // Use VariantProps from the local CVA
>(
    ({ asChild = false, isActive, tooltip, className, children, variant, size, ...props }, ref) => { // Destructure variant and size
        const Comp = asChild ? Slot : ((props as React.AnchorHTMLAttributes<HTMLAnchorElement>).href ? "a" : "button") as any;
        const { state: sidebarState, isMobile } = useSidebar();
        const isCollapsed = sidebarState === 'collapsed' && !isMobile;

        const buttonContent = (
           <Comp
              ref={ref}
              className={cn(sidebarMenuButtonVariants({ variant, size, isActive, isCollapsed }), className)} // Pass variant and size here
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


// Sidebar Toggle Button (optional explicit control)
export const SidebarToggleButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  const { toggleSidebar, isMobile } = useSidebar();

  // On mobile, this button might live in the Header and use SheetTrigger
  if (isMobile) {
    return null; // Or render SheetTrigger if used here
  }

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn("hidden md:inline-flex", className)}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
SidebarToggleButton.displayName = "SidebarToggleButton"
