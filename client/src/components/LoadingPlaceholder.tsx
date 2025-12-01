import markPhoto from "@assets/Mark_1763305942420.png";
import thadPhoto from "@assets/Thad_1763954316719.png";
import shawnPhoto from "@assets/shawn_preview.png";
import williePhoto from "@assets/Willie Gault.png";
import junePhoto from "@assets/June.png";
import annPhoto from "@assets/Ann.png";
import nigelPhoto from "@assets/Nigel_1763954340501.png";
import kelseyPhoto from "@assets/kelsey_preview.png";
import judyPhoto from "@assets/judy_preview.png";
import dexterPhoto from "@assets/dexter_preview.png";

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
  "nigel": nigelPhoto,
  "kelsey": kelseyPhoto,
  "judy": judyPhoto,
  "dexter": dexterPhoto,
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
