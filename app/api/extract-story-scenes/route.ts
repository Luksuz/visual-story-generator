import { extractStoryScenes } from "@/app/ai/actions";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { storyText, numberOfScenes = 3, characterNames = [], extractCharactersFromText = false } = await req.json();

    if (!storyText) {
      return NextResponse.json({ error: "Story text is required" }, { status: 400 });
    }

    const scenes = await extractStoryScenes(storyText, numberOfScenes, characterNames, extractCharactersFromText);
    
    return NextResponse.json({ scenes });
  } catch (error) {
    console.error("Error extracting story scenes:", error);
    return NextResponse.json({ 
      error: "Failed to extract story scenes", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 