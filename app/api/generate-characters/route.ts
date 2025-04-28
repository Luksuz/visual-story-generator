import { generateObject } from "@/app/ai/actions"
import { z } from "zod"
import { NextResponse } from "next/server"

// Define the character schema
const CharacterSchema = z.object({
  characters: z
    .array(
      z.object({
        name: z.string().describe("The character's name"),
        description: z.string().describe("A brief description of the character"),
        traits: z.array(z.string()).describe("Key personality traits of the character"),
        background: z.string().describe("The character's background story"),
      }),
    )
    .describe("A list of fictional characters"),
})

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json()

    const result = await generateObject({
      model: "gpt-4o-mini",
      schema: CharacterSchema,
      prompt: `Generate characters with names, descriptions, traits, and backgrounds based on the following character descriptions: ${prompt || ""}`,
    })

    return NextResponse.json(result.object)
  } catch (error) {
    console.error("Error generating characters:", error)
    return NextResponse.json({ error: "Failed to generate characters" }, { status: 500 })
  }
}
