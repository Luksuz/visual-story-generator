import { generateCharacterImages } from "@/app/ai/actions";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { characters, style = "realistic" } = await req.json();

    if (!characters || !Array.isArray(characters)) {
      return NextResponse.json({ error: "Invalid characters data" }, { status: 400 });
    }

    const characterImages = await generateCharacterImages(characters, style);
    
    return NextResponse.json({ images: characterImages });
  } catch (error) {
    console.error("Error generating character images:", error);
    return NextResponse.json({ error: "Failed to generate character images" }, { status: 500 });
  }
} 