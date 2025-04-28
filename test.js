import fs from "fs";
import OpenAI from "openai";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: "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",
});

// Define a schema for story characters using Zod (equivalent to Pydantic in Python)
const StoryCharacter = z.object({
    name: z.string().describe("The character's name"),
    description: z.string().describe("A brief description of the character"),
    traits: z.array(z.string()).describe("List of character traits")
});

// Define a schema that contains a list of characters
// Using an object wrapper since the API requires 'type: "object"' schemas
const CharactersResponseSchema = z.object({
    characters: z.array(StoryCharacter).describe("List of characters from the story")
});

/**
 * Extract a list of characters from a story script
 * @param {string} storyText - The full text of the story
 * @returns {Promise<{characters: Array}>} - Object containing list of character objects
 */
async function extractCharactersFromStory(storyText) {
    // Initialize the language model
    const llm = new ChatOpenAI({
        modelName: "gpt-4.1-mini",
        temperature: 0,
        openAIApiKey: openai.apiKey,
    });
    
    // Create structured output model
    const modelWithStructure = llm.withStructuredOutput(CharactersResponseSchema);
    
    // Create the prompt
    const prompt = `Based on the following story, create a list of characters.
For each character, include their name, a brief description, and a list of traits.
Only include characters that actually appear or are mentioned in the story.

Story:
${storyText}`;
    
    // Invoke the model with the prompt
    const response = await modelWithStructure.invoke(prompt);
    return response;
}

/**
 * Main function to process a story file and extract characters
 * @param {string} storyFilePath - Path to the story file
 */
async function main() {
    try {
        // Read the story file
        const storyFilePath = "story.txt";
        const storyText = fs.readFileSync(storyFilePath, 'utf-8');
        
        console.log(`Extracting characters from story file: ${storyFilePath}`);
        
        // Extract characters from the story
        const result = await extractCharactersFromStory(storyText);
        
        // Output the results
        console.log("Extracted Characters:");
        console.log(JSON.stringify(result.characters, null, 2));
        
        return result.characters;
    } catch (error) {
        console.error("Error:", error);
        throw error;
    }
}

// Execute the main function
main().catch(error => {
    console.error("Execution error:", error);
    process.exit(1);
});