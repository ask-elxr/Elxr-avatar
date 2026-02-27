import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 backdrop-blur-md",
  {
    variants: {
      variant: {
        default: "glass-strong border border-purple-500/30 text-white hover:border-purple-500/50 hover:bg-gradient-primary hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:scale-[1.02]",
        destructive:
          "glass-strong border border-red-500/30 text-red-100 hover:border-red-500/50 hover:bg-red-500/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:scale-[1.02]",
        outline:
          "glass border border-white/20 text-white hover:border-purple-500/50 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(139,92,246,0.2)]",
        secondary:
          "glass-strong border border-cyan-500/30 text-white hover:border-cyan-500/50 hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:scale-[1.02]",
        ghost: "text-white/80 hover:bg-white/10 hover:text-white hover:shadow-[0_0_10px_rgba(139,92,246,0.2)]",
        link: "text-purple-400 underline-offset-4 hover:underline hover:text-purple-300",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
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
