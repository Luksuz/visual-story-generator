import { generateStorySceneImages } from "@/app/ai/actions";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { scenes, characterImages } = await req.json();

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: "Valid scene data is required" }, { status: 400 });
    }

    if (!characterImages || !Array.isArray(characterImages) || characterImages.length === 0) {
      return NextResponse.json({ error: "Character image data is required" }, { status: 400 });
    }

    try {
      const storyImages = await generateStorySceneImages(scenes, characterImages);
      return NextResponse.json({ images: storyImages });
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
    console.error("Error generating story images:", error);
    return NextResponse.json({ 
      error: "Failed to generate story images", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 