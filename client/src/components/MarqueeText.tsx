import { useRef, useEffect, useState } from "react";

interface MarqueeTextProps {
  text: string;
  className?: string;
  maxWidth?: string;
}

export function MarqueeText({ text, className = "", maxWidth = "100%" }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        const isOverflowing = textWidth > containerWidth;
        setShouldScroll(isOverflowing);
        if (isOverflowing) {
          setScrollDistance(textWidth - containerWidth + 20);
        }
      }
    };
    
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    
    const timeoutId = setTimeout(checkOverflow, 100);
    
    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timeoutId);
    };
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      className={`overflow-hidden relative ${className}`}
      style={{ maxWidth }}
      title={text}
    >
      <div className="flex">
        <span
          ref={textRef}
          className="whitespace-nowrap"
          style={{
            animation: shouldScroll ? `marquee-scroll 6s ease-in-out infinite` : 'none',
            ['--scroll-distance' as string]: `-${scrollDistance}px`,
          }}
        >
          {text}
        </span>
      </div>
      <style>{`
        @keyframes marquee-scroll {
          0%, 15% {
            transform: translateX(0);
          }
          45%, 55% {
            transform: translateX(var(--scroll-distance));
          }
          85%, 100% {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
