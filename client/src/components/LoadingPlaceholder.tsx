import markPhoto from "@assets/Mark_1763305942420.png";
import thadPhoto from "@assets/Thad_1763305942420.png";
import katyaPhoto from "@assets/Katya_1763305580145.png";

interface LoadingPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  avatarId?: string;
}

const avatarPhotos: Record<string, string> = {
  "mark-kohl": markPhoto,
  "mark": markPhoto,
  "thad": thadPhoto,
  "katya": katyaPhoto,
  "willie-gault": markPhoto,
  "willie": markPhoto,
  "june": katyaPhoto,
  "ann": katyaPhoto,
  "shawn": thadPhoto,
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
