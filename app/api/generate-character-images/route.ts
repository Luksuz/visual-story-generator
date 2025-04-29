import { generateCharacterImagesMiniMax, generateCharacterImagesOpenai } from "@/app/ai/actions";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { characters, style = "realistic", provider } = await req.json();

    if (!characters || !Array.isArray(characters)) {
      return NextResponse.json({ error: "Invalid characters data" }, { status: 400 });
    }

    let characterImages;
    if (provider === "minimax") {
      console.log("Generating character images with MiniMax");
      characterImages = await generateCharacterImagesMiniMax(characters, style);
    } else {
      console.log("Generating character images with OpenAI");
      characterImages = await generateCharacterImagesOpenai(characters, style);
    }
    
    return NextResponse.json({ images: characterImages });
  } catch (error) {
    console.error("Error generating character images:", error);
    return NextResponse.json({ error: "Failed to generate character images" }, { status: 500 });
  }
} 