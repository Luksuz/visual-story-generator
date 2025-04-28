import { NextResponse } from "next/server";
import mammoth from "mammoth";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Check if the file is a docx file
    const isDocx = file.name.toLowerCase().endsWith(".docx");
    
    if (!isDocx) {
      return NextResponse.json({ error: "File must be a .docx document" }, { status: 400 });
    }

    // Get file content as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from docx file
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Error parsing docx file:", error);
    return NextResponse.json({ 
      error: "Failed to parse document"
    }, { status: 500 });
  }
} 