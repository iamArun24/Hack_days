import { Command as Primitive } from 'cmdk'
import { Search } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Command({ className, ...props }: ComponentProps<typeof Primitive>) {
  return <Primitive className={cn('flex h-full w-full flex-col overflow-hidden', className)} {...props} />
}

export function CommandInput({ className, ...props }: ComponentProps<typeof Primitive.Input>) {
  return (
    <div className="flex h-14 items-center gap-3 border-b px-4">
      <Search className="size-4 shrink-0 text-primary" />
      <Primitive.Input
        className={cn(
          'h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground',
          className,
        )}
        {...props}
      />
    </div>
  )
}

export function CommandList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      className={cn('max-h-[min(60vh,420px)] scroll-py-2 overflow-y-auto overscroll-contain p-2', className)}
      {...props}
    />
  )
}

export function CommandEmpty(props: ComponentProps<typeof Primitive.Empty>) {
  return <Primitive.Empty className="py-10 text-center text-[13px] text-muted-foreground" {...props} />
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof Primitive.Group>) {
  return (
    <Primitive.Group
      className={cn(
        '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle-foreground [&_[cmdk-group-heading]]:uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function CommandItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        'flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-[background-color,padding] duration-150 outline-none select-none data-[disabled=true]:opacity-45 data-[selected=true]:bg-primary/10 data-[selected=true]:pl-3.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[selected=true]:[&_svg]:text-primary',
        className,
      )}
      {...props}
    />
  )
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn('-mx-2 my-1 h-px bg-border', className)} {...props} />
}
