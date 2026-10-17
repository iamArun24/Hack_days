import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-default items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out select-none active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_70%,var(--color-peach)))] text-primary-foreground shadow-[0_6px_18px_-8px_var(--color-primary)] hover:shadow-[0_10px_24px_-8px_var(--color-primary)] hover:brightness-105',
        secondary:
          'border border-border bg-panel text-foreground shadow-xs hover:border-border-strong hover:bg-muted',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:border-primary/40 hover:bg-primary/5',
        ghost:
          'text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground',
        danger: 'text-danger hover:bg-danger/12',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 px-2 text-xs [&_svg]:size-3.5',
        sm: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
        md: 'h-8 px-3 text-[13px] [&_svg]:size-4',
        lg: 'h-10 rounded-xl px-4 text-sm [&_svg]:size-4',
        'icon-xs': 'size-6 [&_svg]:size-3.5',
        'icon-sm': 'size-7 [&_svg]:size-4',
        icon: 'size-8 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
