import Admin, { type AdminView } from "../admin";

interface EmbedAdminProps {
  view: AdminView;
}

export default function EmbedAdmin({ view }: EmbedAdminProps) {
  return (
    <Admin 
      isEmbed={true} 
      embedView={view}
    />
  );
}
