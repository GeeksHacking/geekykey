import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
  Customised from shadcn new-york:
  - press feedback with scale, no shadows (they turn to mud on the dark theme)
  - 2px focus ring offset from the background for keyboard users
  The 40px default height that makes buttons comfortable thumb targets on a
  phone lives in the `size` variants below (h-10), not in these base styles.
*/
const buttonVariants = cva(
  [
    // Layout and type.
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    // `transform` is in the transition list so the active: press below eases
    // instead of snapping.
    "transition-[color,background-color,border-color,transform] duration-150",
    // Focus ring is scoped to focus-visible throughout, so it paints for
    // keyboard users without ringing every mouse click.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // The house press feedback, applied to every button for consistency.
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
    // `[&_svg]` is a Tailwind arbitrary variant meaning "any <svg> descendant of
    // this element". Icons passed as children are pinned to 16px, kept from
    // shrinking in the flex row, and made click-through so a press always
    // registers on the button rather than on the icon.
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "border border-primary-edge bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
