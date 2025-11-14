import introLogoVideo from "@assets/intro logo_1760052672430.mp4";

interface LoadingPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function LoadingPlaceholder({ className = "", ...props }: LoadingPlaceholderProps) {
  return (
    <div className={`flex items-center justify-center ${className}`} {...props}>
      <video
        src={introLogoVideo}
        autoPlay
        loop
        muted
        playsInline
        className="w-full max-w-md h-auto"
        data-testid="intro-logo-video"
      />
    </div>
  );
}
