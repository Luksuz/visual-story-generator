import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log(process.env.OPENAI_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generic function to generate structured objects based on a schema
export async function generateObject<T extends z.ZodType>({
  model,
  schema,
  prompt,
}: {
  model: any;
  schema: T;
  prompt: string;
}) {
  const llm = new ChatOpenAI({
    modelName: "gpt-4.1-mini",
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
  const modelWithStructure = llm.withStructuredOutput(schema);
  const result = await modelWithStructure.invoke(prompt);
  console.log(result);

  return {
    object: result,
  };
}

// Function to generate character images
export async function generateCharacterImageOpenai(
  description: string,
  style?: string
) {
  try {
    let prompt = `A detailed character portrait of the following character: ${description}`;

    // Apply style if provided
    if (style && style.trim() !== "") {
      prompt += `. Style: ${style}`;
    }

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompt,
      size: "1024x1024",
    });

    if (!result.data || result.data.length === 0) {
      throw new Error("No image data returned from OpenAI");
    }

    return result.data[0].b64_json;
  } catch (error) {
    console.error("Error generating character image:", error);
    throw error;
  }
}

// Function to generate multiple character images in parallel
export async function generateCharacterImagesOpenai(
  characters: Array<{ name: string; archetype: string; description: string }>,
  style?: string
) {
  try {
    const imagePromises = characters.map((character) => {
      // Use archetype instead of name for image generation prompt
      // This helps avoid potential moderation issues with OpenAI
      const imageDescription = `${character.archetype}: ${character.description}`;

      return generateCharacterImageOpenai(imageDescription, style).then(
        (imageData) => ({
          name: character.name,
          archetype: character.archetype,
          imageData,
        })
      );
    });

    return Promise.all(imagePromises);
  } catch (error) {
    console.error("Error generating character images:", error);
    throw error;
  }
}

// Function to generate character images using MiniMax API
export async function generateCharacterImageMiniMax(
  description: string,
  style?: string
) {
  try {
    let prompt = `A detailed character portrait of the following character: ${description}`;

    // Apply style if provided
    if (style && style.trim() !== "") {
      prompt += `. Style: ${style}`;
    }
    // Using fetch API for HTTP requests in JavaScript
    const url: string | undefined = process.env.MINIMAX_API_URL;
    const apiKey: string | undefined = process.env.MINIMAX_API_KEY;
    if (!url || !apiKey) {
      throw new Error("Missing Minimax API URL or API key");
    }

    const payload = {
      model: "image-01",
      prompt: prompt,
      aspect_ratio: "16:9",
      response_format: "base64",
      n: 1,
      prompt_optimizer: true,
    };

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch from Minimax API");
    }

    const result = await response.json();
    return result.data.image_base64[0];
  } catch (error) {
    console.error("Error generating character image using MiniMax API:", error);
    throw error;
  }
}

// Function to generate multiple character images in parallel using MiniMax API
export async function generateCharacterImagesMiniMax(
  characters: Array<{ name: string; archetype: string; description: string }>,
  style?: string
) {
  try {
    const imagePromises = characters.map((character) => {
      // Use archetype instead of name for image generation prompt
      const imageDescription = `${character.archetype}: ${character.description}`;

      return generateCharacterImageMiniMax(imageDescription, style).then(
        (imageData) => ({
          name: character.name,
          archetype: character.archetype,
          imageData,
        })
      );
    });

    return Promise.all(imagePromises);
  } catch (error) {
    console.error(
      "Error generating character images using MiniMax API:",
      error
    );
    throw error;
  }
}

// Function to create a schema for analyzing story chunks with a specific list of character names
export function createStoryChunkAnalysisSchema(characterNames: string[]) {
  // If no character names provided, use a generic schema
  if (!characterNames || characterNames.length === 0) {
    return z.object({
      summary: z
        .string()
        .describe("A brief summary of what happens in this chunk of the story"),
      characters: z
        .array(
          z.object({
            name: z
              .string()
              .describe("The character's name as it appears in the story"),
            importance: z
              .number()
              .describe("How important this character is to this chunk (1-10)"),
          })
        )
        .describe("Characters that appear in this chunk of the story"),
      setting: z
        .string()
        .describe(
          "The setting or location where this part of the story takes place"
        ),
      mood: z
        .string()
        .describe("The mood or emotional tone of this part of the story"),
      visualDescription: z
        .string()
        .describe(
          "A detailed visual description of how this part of the story should look as an image"
        ),
    });
  }

  // Create the schema with a custom validator instead of an enum to handle any character name
  return z.object({
    summary: z
      .string()
      .describe("A brief summary of what happens in this chunk of the story"),
    characters: z
      .array(
        z.object({
          name: z
            .string()
            .describe("The character's name from the predefined list")
            .refine(
              (name: string) => characterNames.includes(name),
              (name: string) => ({
                message: `Character name must be one of: ${characterNames.join(
                  ", "
                )}`,
              })
            ),
          importance: z
            .number()
            .describe("How important this character is to this chunk (1-10)"),
        })
      )
      .describe(
        "Characters from the predefined list that appear in this chunk of the story"
      ),
    setting: z
      .string()
      .describe(
        "The setting or location where this part of the story takes place"
      ),
    mood: z
      .string()
      .describe("The mood or emotional tone of this part of the story"),
    visualDescription: z
      .string()
      .describe(
        "A detailed visual description of how this part of the story should look as an image"
      ),
  });
}

// Function to extract scenes from a story text using text splitter and a list of available characters
export async function extractStoryScenes(
  storyText: string,
  numberOfScenes: number,
  characterNames: string[] = [],
  extractCharactersFromText: boolean = false
) {
  try {
    let validCharacterNames = [];

    // If no character names provided and extractCharactersFromText flag is set, try to extract them from text
    if (
      (characterNames.length === 0 || !characterNames) &&
      extractCharactersFromText
    ) {
      console.log(
        "No character names provided. Attempting to extract characters from text..."
      );

      // Create a simplified character extraction schema
      const CharacterExtractionSchema = z.object({
        characters: z
          .array(
            z.string().describe("A character name that appears in the story")
          )
          .describe("List of character names found in the story"),
      });

      // Extract character names from the beginning of the text (first 8000 tokens to keep it manageable)
      const extractionText = storyText.substring(
        0,
        Math.min(storyText.length, 8000)
      );
      const extractionPrompt = `
Analyze the beginning of this story and extract a list of character names that appear.
Only include actual character names, not generic terms like "the man" or "a woman" unless they are the only way 
the character is referred to throughout the text.

Story beginning:
${extractionText}

Extract all character names as simple strings in an array with no additional information.
`;

      try {
        const extractionResult = await generateObject({
          model: "gpt-4.1-mini",
          schema: CharacterExtractionSchema,
          prompt: extractionPrompt,
        });

        validCharacterNames = extractionResult.object.characters.filter(
          (name: string) => typeof name === "string" && name.trim().length > 0
        );

        console.log(
          `Extracted ${validCharacterNames.length} character names from text:`,
          validCharacterNames
        );
      } catch (error) {
        console.error("Error extracting character names from text:", error);
        validCharacterNames = []; // Use empty array if extraction fails
      }
    } else {
      // Use provided character names
      // Filter out invalid character names
      validCharacterNames = characterNames.filter(
        (name: string) => typeof name === "string" && name.trim().length > 0
      );
    }

    if (validCharacterNames.length === 0) {
      console.warn("No valid character names available. Using generic schema.");
    }

    // Calculate chunk size based on story length and desired number of scenes
    const textLength = storyText.length;
    const chunkSize = Math.ceil(textLength / numberOfScenes);
    const chunkOverlap = Math.min(Math.floor(chunkSize * 0.1), 200); // 10% overlap, max 200 chars

    console.log(
      `Text length: ${textLength}, Chunk size: ${chunkSize}, Chunk overlap: ${chunkOverlap}`
    );
    console.log(`Available characters: ${validCharacterNames.join(", ")}`);

    // Create text splitter with calculated parameters
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ["\n\n", "\n", ". ", " ", ""],
    });

    // Split the text into chunks
    const chunks = await splitter.createDocuments([storyText]);

    // Limit to the requested number of scenes
    const limitedChunks = chunks.slice(0, numberOfScenes);

    console.log(`Created ${limitedChunks.length} chunks from text`);

    // Create a schema with the available character names
    const StoryChunkAnalysisSchema =
      createStoryChunkAnalysisSchema(validCharacterNames);

    // Analyze each chunk to extract scene information
    const scenePromises = limitedChunks.map(async (chunk, index) => {
      try {
        const chunkText = chunk.pageContent;
        console.log(`Analyzing chunk ${index + 1} (${chunkText.length} chars)`);

        // Create a prompt that emphasizes using only the provided character names
        let analysisPrompt = `
Analyze this chunk of a story and extract key information that could be used to create a visual scene.
`;

        // Only include character name instructions if we have valid character names
        if (validCharacterNames.length > 0) {
          analysisPrompt += `
IMPORTANT: You must only use these EXACT character names in your output (copy and paste them):
${validCharacterNames.map((name: string) => `"${name}"`).join(", ")}

If a character in the text is not in this list, match them to the closest name in the list or omit them.
Do not add any new characters or modify the names in any way.
`;
        } else {
          analysisPrompt += `
Extract any character names that appear in this chunk. Use the exact name as it appears in the text.
`;
        }

        analysisPrompt += `
Story chunk:
${chunkText}
`;

        const result = await generateObject({
          model: "gpt-4.1-mini",
          schema: StoryChunkAnalysisSchema,
          prompt: analysisPrompt,
        });

        // Verify that all character names in the result are valid if we have a list
        const sceneData = result.object;
        if (validCharacterNames.length > 0) {
          const characterVerification = sceneData.characters.every(
            (char: { name: string }) => validCharacterNames.includes(char.name)
          );

          if (!characterVerification) {
            console.warn(
              `Chunk ${
                index + 1
              }: Some character names are not in the provided list, filtering them out`
            );
            sceneData.characters = sceneData.characters.filter(
              (char: { name: string }) =>
                validCharacterNames.includes(char.name)
            );
          }
        }

        return sceneData;
      } catch (error) {
        console.error(`Error analyzing chunk ${index + 1}:`, error);
        // Provide fallback data for failed chunk analysis
        return {
          summary: `Scene ${index + 1}`,
          characters: [],
          setting: "Unknown setting",
          mood: "Neutral",
          visualDescription: `A scene from the story, section ${index + 1}`,
        };
      }
    });

    const scenes = await Promise.all(scenePromises);
    return scenes;
  } catch (error) {
    console.error("Error extracting story scenes:", error);
    throw error;
  }
}

// Helper to convert base64 image to a File object for OpenAI API
async function base64ToFile(
  base64Data: string,
  name: string,
  type = "image/png"
) {
  const buffer = Buffer.from(base64Data, "base64");

  // Convert buffer to blob
  const blob = new Blob([buffer], { type });

  // Create a FileReader to read the blob
  return toFile(new Blob([buffer], { type }), name, { type });
}

// Function to generate a story scene image using character images as context
export async function generateStorySceneImageOpenai(
  sceneDescription: string,
  sceneCharacters: Array<{ name: string; imageData: string }>,
  resolution: string = "1024x1024"
) {
  try {
    // Always use landscape format - 1024x1024 for standard or 1536x1024 for high quality
    let finalResolution =
      resolution === "1536x1024" ? "1536x1024" : "1024x1024";

    if (sceneCharacters.length === 0) {
      // If no character images, use regular image generation
      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `Create a wide landscape scene showing: ${sceneDescription}`,
        size: finalResolution as any, // Cast to any to handle type constraints
      });

      if (!result.data || result.data.length === 0) {
        throw new Error("No image data returned from OpenAI");
      }

      return result.data[0].b64_json;
    } else {
      // Use image edit with multiple character images as context
      console.log(
        `Generating scene with ${sceneCharacters.length} character images as context`
      );

      // Convert the base64 character images to File objects
      const characterImagePromises = sceneCharacters.map(
        async (char, index) => {
          const filename = `character_${index + 1}_${char.name.replace(
            /\s+/g,
            "_"
          )}.png`;
          return await base64ToFile(char.imageData, filename);
        }
      );

      const characterImageFiles = await Promise.all(characterImagePromises);

      // Generate the scene image using character images as context
      const result = await openai.images.edit({
        model: "gpt-image-1",
        image: characterImageFiles[0], // Use the first character image as the base
        prompt: `Create a wide landscape scene showing: ${sceneDescription}. Style of the scene should be consistent with style of reference character images.`,
        size: finalResolution as any, // Cast to any to handle type constraints
        n: 1,
      });

      if (!result.data || result.data.length === 0) {
        throw new Error("No image data returned from OpenAI");
      }

      return result.data[0].b64_json;
    }
  } catch (error) {
    console.error("Error generating story scene image:", error);
    throw error;
  }
}

// Function to generate multiple story scene images
export async function generateStorySceneImagesOpenai(
  scenes: Array<{
    summary: string;
    characters: Array<{ name: string; importance: number }>;
    setting: string;
    mood: string;
    visualDescription: string;
  }>,
  characterImages: Array<{ name: string; imageData: string }>
) {
  try {
    const sceneImagePromises = scenes.map((scene) => {
      // Find the character images for characters in this scene
      const sceneCharacterImages = scene.characters
        .map((sceneChar) => {
          const matchingChar = characterImages.find(
            (charImg) => charImg.name === sceneChar.name
          );
          return matchingChar
            ? { ...matchingChar, importance: sceneChar.importance }
            : null;
        })
        .filter((char) => char !== null)
        .sort((a, b) => (b?.importance || 0) - (a?.importance || 0))
        // Limit to first 4 characters since that's what the API can handle
        .slice(0, 4);

      // Create a detailed prompt for the scene
      const prompt = `Create a visually striking scene showing: ${
        scene.visualDescription
      }
Setting: ${scene.setting}
Mood: ${scene.mood}
${
  scene.characters.length > 0
    ? `Featuring characters: ${scene.characters.map((c) => c.name).join(", ")}`
    : ""
}`;

      // Generate the scene image
      return generateStorySceneImageOpenai(
        prompt,
        sceneCharacterImages as Array<{ name: string; imageData: string }>
      ).then((imageData) => ({
        summary: scene.summary,
        imageData,
      }));
    });

    return Promise.all(sceneImagePromises);
  } catch (error) {
    console.error("Error generating story scene images:", error);
    throw error;
  }
}

// Function to generate a story scene image using character images as context using MiniMax API
export async function generateStorySceneImageMiniMax(
  sceneDescription: string,
  sceneCharacters: Array<{ name: string; imageData: string }>,
  resolution: string = "1024x1024",
  tonePreference: string = "balanced",
  randomSeed?: string
) {
  try {
    // Always use landscape format - 1024x1024 for standard or 1536x1024 for high quality
    const { width, height } =
      resolution === "1536x1024"
        ? { width: 1536, height: 1024 }
        : { width: 1024, height: 1024 };

    const url: string | undefined = process.env.MINIMAX_API_URL;
    const apiKey: string | undefined = process.env.MINIMAX_API_KEY;

    if (!url || !apiKey) {
      throw new Error("Missing Minimax API URL or API key");
    }

    // Prepare character references if available
    let payload;
    if (sceneCharacters.length > 0) {
      // MiniMax can only use one subject reference, so we'll use just the first one
      // The frontend will send a character mosaic if needed
      const characterImageData = sceneCharacters[0].imageData;
      
      // Include random seed and prompt optimizer to avoid repetition
      payload = {
        model: "image-01",
        prompt: sceneDescription,
        subject_reference: [
          {
            type: "character",
            image_file: `data:image/jpeg;base64,${characterImageData}`,
          }
        ],
        width: width,
        height: height,
        n: 1,
        response_format: "base64",
        prompt_optimizer: false, // Disable to get more control over style
        custom_params: {
          seed: randomSeed ? parseInt(randomSeed.substring(0, 10)) % 1000000 : Math.floor(Math.random() * 1000000),
          tone_preference: tonePreference
        }
      };
    } else {
      payload = {
        model: "image-01",
        prompt: sceneDescription,
        width: width,
        height: height,
        n: 1,
        response_format: "base64",
        prompt_optimizer: false, // Disable to get more control over style
        custom_params: {
          seed: randomSeed ? parseInt(randomSeed.substring(0, 10)) % 1000000 : Math.floor(Math.random() * 1000000),
          tone_preference: tonePreference
        }
      };
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch from Minimax API");
    }

    const result = await response.json();

    console.log("MiniMax result:", result);

    return result.data.image_base64[0];
  } catch (error) {
    console.error(
      "Error generating story scene image using MiniMax API:",
      error
    );
    throw error;
  }
}

export async function generateStorySceneImagesMiniMax(
  scenes: Array<{
    summary: string;
    characters: Array<{ name: string; importance: number }>;
    setting: string;
    mood: string;
    visualDescription: string;
    style: string;
  }>,
  characterImages: Array<{ name: string; imageData: string }>,
  tonePreference: string = "balanced"
) {
  try {
    const sceneImagePromises = scenes.map((scene) => {
      // Find the character images for characters in this scene
      const sceneCharacterImages = scene.characters
        .map((sceneChar) => {
          const matchingChar = characterImages.find(
            (charImg) => charImg.name === sceneChar.name
          );
          return matchingChar
            ? { ...matchingChar, importance: sceneChar.importance }
            : null;
        })
        .filter((char) => char !== null)
        .sort((a, b) => (b?.importance || 0) - (a?.importance || 0))
        .slice(0, 4);

      // Create a detailed prompt for the scene
      const prompt = `Create a visually striking scene showing: ${
        scene.visualDescription
      }
Setting: ${scene.setting}
Mood: ${scene.mood}
style: ${scene.style}
${
  scene.characters.length > 0
    ? `Featuring characters: ${scene.characters.map((c) => c.name).join(", ")}`
    : ""
}`;

      // Generate unique seed for each scene
      const randomSeed = Date.now() + "-" + Math.floor(Math.random() * 1000000);

      // Generate the scene image
      return generateStorySceneImageMiniMax(
        prompt,
        sceneCharacterImages as Array<{ name: string; imageData: string }>,
        "1536x1024",
        tonePreference,
        randomSeed
      ).then((imageData) => ({
        summary: scene.summary,
        imageData,
      }));
    });

    return Promise.all(sceneImagePromises);
  } catch (error) {
    console.error(
      "Error generating story scene images using MiniMax API:",
      error
    );
    throw error;
  }
}

// Function to extract character information from a story script
export async function extractCharactersFromScript(storyText: string) {
  try {
    if (!storyText || storyText.trim().length === 0) {
      throw new Error("Empty script provided");
    }

    console.log("Extracting characters from script...");

    // Define the schema for character extraction
    const CharacterExtractionSchema = z.object({
      characters: z
        .array(
          z.object({
            name: z
              .string()
              .describe(
                "The character's actual name as it appears in the script"
              ),
            archetype: z
              .string()
              .describe(
                "A generic role or archetype label (e.g., 'Hero', 'Villain', 'Mentor')"
              ),
            description: z
              .string()
              .describe("A detailed physical description of the character"),
            traits: z
              .array(z.string())
              .describe("Key personality traits of the character"),
            background: z
              .string()
              .describe("Brief background or history of the character"),
          })
        )
        .describe(
          "All significant characters that appear in the script with relevant details"
        ),
    });

    // Create a prompt for character extraction
    const extractionPrompt = `
Analyze the following story script and identify distinct characters. For each character:

1. Extract their ACTUAL NAME as it appears in the script (e.g., "John Smith", "Mary Johnson")
2. Assign a generic ARCHETYPE or role label that describes their function (e.g., "Hero", "Villain", "Mentor", "Sidekick")
3. Provide a detailed physical description
4. List their key personality traits
5. Summarize their role and background in the story

IMPORTANT: Make sure to use the character's REAL NAME in the "name" field and a GENERIC ARCHETYPE in the "archetype" field.
The archetype field will be used for image generation to avoid moderation issues, so it should be a generic role description.
Dont refer to real names in the description, just provide a generic description of the character, if not provided, think of one.

Example:
name: "Sarah Johnson"
archetype: "Hero"
description: "A young woman with a strong sense of justice and a knack for solving problems, Wears a red cape and blue tights"
traits: ["strong sense of justice", "problem solver", "determined"]
background: "Sarah grew up in a small town where she witnessed the corruption of the local authorities. This inspired her to become a hero and fight for justice."

Focus on identifying main and supporting characters only. Ignore minor background characters.

Story script:
${storyText}
`;

    const result = await generateObject({
      model: "gpt-4.1-mini",
      schema: CharacterExtractionSchema,
      prompt: extractionPrompt,
    });

    console.log(
      `Extracted ${result.object.characters.length} characters from script`
    );
    return result.object.characters;
  } catch (error) {
    console.error("Error extracting characters from script:", error);
    throw error;
  }
}
