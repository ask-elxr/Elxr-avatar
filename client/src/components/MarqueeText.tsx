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
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const cWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        const isOverflowing = textWidth > cWidth;
        setShouldScroll(isOverflowing);
        setContainerWidth(cWidth);
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

  if (!shouldScroll) {
    return (
      <div 
        ref={containerRef} 
        className={`overflow-hidden relative ${className}`}
        style={{ maxWidth }}
        title={text}
      >
        <span ref={textRef} className="whitespace-nowrap">{text}</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className={`overflow-hidden relative ${className}`}
      style={{ maxWidth }}
      title={text}
    >
      <div 
        className="flex whitespace-nowrap animate-marquee-slow"
        style={{
          animation: 'marquee-continuous 15s linear infinite',
        }}
      >
        <span ref={textRef} className="inline-block pr-16">{text}</span>
        <span className="inline-block pr-16">{text}</span>
      </div>
      <style>{`
        @keyframes marquee-continuous {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
