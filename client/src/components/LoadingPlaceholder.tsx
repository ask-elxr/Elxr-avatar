interface LoadingPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  avatarId?: string;
}

const avatarGifs: Record<string, string> = {
  "mark-kohl": "/attached_assets/MArk-kohl-loop_1763964600000.gif",
  "mark": "/attached_assets/MArk-kohl-loop_1763964600000.gif",
  "willie-gault": "/attached_assets/Willie gault gif-low_1763964813725.gif",
  "willie": "/attached_assets/Willie gault gif-low_1763964813725.gif",
  "june": "/attached_assets/June-low_1764106896823.gif",
  "thad": "/attached_assets/Thad_1763963906199.gif",
  "nigel": "/attached_assets/Nigel-Loop-avatar_1763964600000.gif",
  "ann": "/attached_assets/Ann_1763966361095.gif",
  "kelsey": "/attached_assets/Kelsey_1764111279103.gif",
  "judy": "/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif",
  "dexter": "/attached_assets/DexterDoctor-ezgif.com-loop-count_1764111811631.gif",
  "shawn": "/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif",
};

export function LoadingPlaceholder({ 
  className = "", 
  avatarId = "mark-kohl",
  ...props 
}: LoadingPlaceholderProps) {
  const gifSrc = avatarGifs[avatarId] || avatarGifs["mark-kohl"];
  
  return (
    <div className={`flex items-center justify-center bg-black ${className}`} {...props}>
      <div 
        className="rounded-full overflow-hidden"
        style={{
          width: '240px',
          height: '240px',
        }}
      >
        <img
          src={gifSrc}
          alt="Avatar"
          className="w-full h-full object-cover"
          data-testid="avatar-gif"
        />
      </div>
    </div>
  );
}
