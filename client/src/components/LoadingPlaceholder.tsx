interface LoadingPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function LoadingPlaceholder({ className = "", ...props }: LoadingPlaceholderProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-6 ${className}`} {...props}>
      <div className="relative w-32 h-32">
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-600 via-purple-400 to-blue-500 opacity-20 animate-pulse"></div>
        <div className="absolute inset-2 rounded-full bg-black"></div>
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 border-r-purple-400 animate-spin"></div>
        <div className="absolute inset-4 rounded-full border-4 border-transparent border-b-blue-500 border-l-blue-400 animate-spin [animation-direction:reverse] [animation-duration:1.5s]"></div>
      </div>
      
      <div className="text-center space-y-2">
        <div className="h-3 w-48 bg-gradient-to-r from-purple-600/20 via-purple-400/40 to-purple-600/20 rounded-full animate-pulse"></div>
        <div className="h-2 w-32 mx-auto bg-gradient-to-r from-blue-600/20 via-blue-400/40 to-blue-600/20 rounded-full animate-pulse [animation-delay:150ms]"></div>
      </div>
    </div>
  );
}
