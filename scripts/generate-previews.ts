import { previewGenerationService } from "../server/services/previewGeneration.js";

async function main() {
  console.log("Starting preview generation for avatars...");
  
  const avatars = ["judy", "dexter", "shawn", "kelsey"];
  
  for (const avatarId of avatars) {
    console.log(`\n🎬 Generating preview for ${avatarId}...`);
    try {
      const result = await previewGenerationService.generatePreviewForAvatar(avatarId);
      if (result.success) {
        console.log(`✅ Success! GIF saved to: ${result.gifPath}`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  console.log("\n🎉 Preview generation complete!");
  process.exit(0);
}

main().catch(console.error);
