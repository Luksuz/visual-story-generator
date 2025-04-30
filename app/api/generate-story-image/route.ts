import { generateStorySceneImageOpenai, generateStorySceneImageMiniMax } from "@/app/ai/actions";
import { NextResponse } from "next/server";


// Define types for scene and character data
type SceneCharacter = {
  name: string;
};

type Scene = {
  summary: string;
  characters: SceneCharacter[];
  setting: string;
  mood: string;
  visualDescription: string;
};

type CharacterImage = {
  name: string;
  imageData: string;
};

export async function POST(req: Request) {
  try {
    const { 
      scene, 
      characterImages = [], 
      style = "realistic", 
      resolution = "1024x1024", 
      fullScript = "", 
      provider = "openai",
      isMosaic = false,
      randomSeed = Date.now(),
      tonePref = "balanced"
    } = await req.json();

    if (!scene) {
      return NextResponse.json({ error: "Scene data is required" }, { status: 400 });
    }
    
    // Validate resolution - only allow standard and high quality options
    const validResolutions = ["1024x1024", "1536x1024"];
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json({ 
        error: "Invalid resolution. Must be one of: 1024x1024 (Standard) or 1536x1024 (High Quality)" 
      }, { status: 400 });
    }

    try {
      // Find the character images for characters in this scene
      let sceneCharacterImages: CharacterImage[] = [];
      
      // If this is a mosaic image for MiniMax, just use the first (and only) image
      if (provider === "minimax" && isMosaic && characterImages.length > 0) {
        console.log("Using character mosaic image for MiniMax");
        sceneCharacterImages = [characterImages[0]];
      } 
      // Otherwise use the normal character matching logic
      else if (Array.isArray(characterImages) && characterImages.length > 0) {
        sceneCharacterImages = scene.characters
          .map((sceneChar: SceneCharacter) => {
            const matchingChar = characterImages.find(
              (charImg: CharacterImage) => charImg.name === sceneChar.name
            );
            return matchingChar ? { ...matchingChar } : null;
          })
          .filter((char: CharacterImage | null) => char !== null)
          // Limit to first 4 characters since that's what the API can handle
          .slice(0, 4);
      }
      
      // Extract a portion of the full script that relates to this scene (to avoid exceeding token limits)
      let scriptContext = "";
      if (fullScript && fullScript.length > 0) {
        // Extract a relevant excerpt from the full script (up to 500 characters)
        const relevantExcerpt = extractRelevantScriptContext(fullScript, scene.summary, 500);
        if (relevantExcerpt) {
          scriptContext = `Based on this story context: "${relevantExcerpt}"

`;
        }
      }
      
      // Add randomization and tone parameters to prevent repetition
      const randomPromptAddition = provider === "minimax" ? 
        ` [Random Seed: ${randomSeed}]` : 
        ""; // For OpenAI we don't need this
      
      const prompt = `${scriptContext}Create a visually striking scene in ${style} style showing: ${scene.visualDescription}
Setting: ${scene.setting}
Mood: ${scene.mood}
${scene.characters.length > 0 ? 
  `Featuring characters: ${scene.characters.map((c: SceneCharacter) => c.name).join(', ')}` : 
  ''}${randomPromptAddition}`;
      
      // Generate the scene image with the specified resolution
      let imageData;
      if (provider === "minimax") {
        imageData = await generateStorySceneImageMiniMax(
          prompt, 
          sceneCharacterImages as CharacterImage[], 
          resolution, 
          tonePref,
          randomSeed.toString()
        );
      } else {
        imageData = await generateStorySceneImageOpenai(prompt, sceneCharacterImages as CharacterImage[], resolution);
      }
      
      return NextResponse.json({ 
        imageData,
        summary: scene.summary
      });
    } catch (imageError) {
      console.error("Error in image processing:", imageError);
      
      // Convert to Error type and handle
      const error = imageError instanceof Error ? imageError : new Error(String(imageError));
      
      // Return a more specific error based on the type of error
      if (error.message.includes("unsupported image format")) {
        return NextResponse.json({ 
          error: "Unable to process images due to format issues",
          details: error.message
        }, { status: 422 });
      }
      
      throw error; // Re-throw to be caught by the outer catch
    }
  } catch (error) {
    console.error("Error generating story image:", error);
    return NextResponse.json({ 
      error: "Failed to generate story image", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 

// Helper function to extract relevant context from the full script based on scene summary
function extractRelevantScriptContext(fullScript: string, sceneSummary: string, maxLength: number = 500): string {
  // Find the most relevant part of the script using scene summary keywords
  const keywords = sceneSummary
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4) // Only consider words longer than 4 characters
    .slice(0, 5); // Use up to 5 keywords

  if (keywords.length === 0) {
    // If no keywords, just return the first part of the script
    return fullScript.slice(0, maxLength);
  }
  
  // Find a part of the script that contains any of these keywords
  let bestMatch = "";
  let bestMatchCount = 0;
  
  // Break script into paragraphs and find the one with most keyword matches
  const paragraphs = fullScript.split(/\n\n+/);
  
  for (const paragraph of paragraphs) {
    if (paragraph.length < 20) continue; // Skip very short paragraphs
    
    const paragraphLower = paragraph.toLowerCase();
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (paragraphLower.includes(keyword)) {
        matchCount++;
      }
    }
    
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestMatch = paragraph;
      
      if (matchCount >= Math.min(3, keywords.length)) {
        // Found a good match, no need to continue
        break;
      }
    }
  }
  
  // If we found a good match, use it, otherwise use the beginning of the script
  const contextToUse = bestMatch || fullScript.slice(0, maxLength);
  
  // Truncate to max length while preserving complete sentences
  if (contextToUse.length <= maxLength) {
    return contextToUse;
  }
  
  // Find the last period within the max length
  const lastPeriodIndex = contextToUse.slice(0, maxLength).lastIndexOf('.');
  if (lastPeriodIndex > maxLength * 0.5) {
    // If we can find a period in the latter half, cut there to preserve a complete thought
    return contextToUse.slice(0, lastPeriodIndex + 1);
  }
  
  // Otherwise just truncate at max length
  return contextToUse.slice(0, maxLength) + "...";
} 