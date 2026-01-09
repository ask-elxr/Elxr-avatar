import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, onClick, ...props }) {
        return (
          <Toast 
            key={id} 
            {...props}
            className={onClick ? "cursor-pointer" : undefined}
            onClick={onClick ? () => {
              onClick();
              dismiss(id);
            } : undefined}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>
                  {description}
                  {onClick && (
                    <span className="ml-1 underline text-primary font-medium">Click to watch</span>
                  )}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
