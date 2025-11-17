import markPhoto from "@assets/Mark_1763305942420.png";
import thadPhoto from "@assets/Thad_1763305942420.png";
import shawnPhoto from "@assets/Katya_1763305580145.png";
import williePhoto from "@assets/Willie Gault.png";
import junePhoto from "@assets/June.png";
import annPhoto from "@assets/Ann.png";

interface LoadingPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  avatarId?: string;
}

const avatarPhotos: Record<string, string> = {
  "mark-kohl": markPhoto,
  "mark": markPhoto,
  "thad": thadPhoto,
  "shawn": shawnPhoto,
  "willie-gault": williePhoto,
  "willie": williePhoto,
  "june": junePhoto,
  "ann": annPhoto,
};

export function LoadingPlaceholder({ 
  className = "", 
  avatarId = "mark-kohl",
  ...props 
}: LoadingPlaceholderProps) {
  const photoSrc = avatarPhotos[avatarId] || markPhoto;
  
  return (
    <div className={`flex items-center justify-center bg-black ${className}`} {...props}>
      <img
        src={photoSrc}
        alt="Avatar"
        className="w-full max-w-md h-auto object-contain"
        data-testid="avatar-photo"
      />
    </div>
  );
}
