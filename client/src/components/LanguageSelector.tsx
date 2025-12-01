import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

interface LanguageOption {
  code: string;
  elevenLabsCode: string;
  name: string;
  flag: string;
}

const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en-US", elevenLabsCode: "en", name: "English (US)", flag: "🇺🇸" },
  { code: "en-GB", elevenLabsCode: "en", name: "English (UK)", flag: "🇬🇧" },
  { code: "es-ES", elevenLabsCode: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "es-MX", elevenLabsCode: "es", name: "Spanish (Mexico)", flag: "🇲🇽" },
  { code: "fr-FR", elevenLabsCode: "fr", name: "French", flag: "🇫🇷" },
  { code: "de-DE", elevenLabsCode: "de", name: "German", flag: "🇩🇪" },
  { code: "it-IT", elevenLabsCode: "it", name: "Italian", flag: "🇮🇹" },
  { code: "pt-BR", elevenLabsCode: "pt", name: "Portuguese (Brazil)", flag: "🇧🇷" },
  { code: "pt-PT", elevenLabsCode: "pt", name: "Portuguese (Portugal)", flag: "🇵🇹" },
  { code: "ja-JP", elevenLabsCode: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko-KR", elevenLabsCode: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "zh-CN", elevenLabsCode: "zh", name: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "zh-TW", elevenLabsCode: "zh", name: "Chinese (Traditional)", flag: "🇹🇼" },
  { code: "hi-IN", elevenLabsCode: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ar-SA", elevenLabsCode: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "ru-RU", elevenLabsCode: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "nl-NL", elevenLabsCode: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "pl-PL", elevenLabsCode: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "sv-SE", elevenLabsCode: "sv", name: "Swedish", flag: "🇸🇪" },
  { code: "tr-TR", elevenLabsCode: "tr", name: "Turkish", flag: "🇹🇷" },
];

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (languageCode: string, elevenLabsCode: string) => void;
  disabled?: boolean;
}

export function LanguageSelector({ 
  selectedLanguage, 
  onLanguageChange, 
  disabled = false 
}: LanguageSelectorProps) {
  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="bg-white/10 hover:bg-white/20 border border-white/20 text-white gap-2"
          disabled={disabled}
          data-testid="button-language-selector"
        >
          <Globe className="w-4 h-4" />
          <span className="text-sm">{currentLanguage.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="max-h-[300px] overflow-y-auto bg-black/90 border-white/20"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => onLanguageChange(lang.code, lang.elevenLabsCode)}
            className={`flex items-center gap-2 cursor-pointer ${
              lang.code === selectedLanguage ? 'bg-white/20' : ''
            }`}
            data-testid={`menu-item-language-${lang.code}`}
          >
            <span className="text-lg">{lang.flag}</span>
            <span className="text-white">{lang.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { SUPPORTED_LANGUAGES };
export type { LanguageOption };
