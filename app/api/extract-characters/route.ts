import { extractCharactersFromScript } from "@/app/ai/actions";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { storyText } = await req.json();

    if (!storyText) {
      return NextResponse.json({ error: "Story text is required" }, { status: 400 });
    }

    const characters = await extractCharactersFromScript(storyText);
    
    return NextResponse.json({ characters });
  } catch (error) {
    console.error("Error extracting characters:", error);
    return NextResponse.json({ 
      error: "Failed to extract characters", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 