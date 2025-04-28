"use client"

import { useState, useRef, ChangeEvent, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Loader2, ImageIcon, FileTextIcon, BookOpenIcon, Upload, FileIcon, UserIcon, Download } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Tabs as TabsType, TabsList as TabsListType, TabsTrigger as TabsTriggerType } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

type Character = {
  name: string
  description: string
  traits: string[]
  background: string
}

type Scene = {
  summary: string
  characters: Array<{ name: string; importance: number }>
  setting: string
  mood: string
  visualDescription: string
}

export default function Home() {
  const [storyText, setStoryText] = useState("")
  const [storySceneCount, setStorySceneCount] = useState(3)
  const [characters, setCharacters] = useState<Character[]>([])
  const [extractingCharacters, setExtractingCharacters] = useState(false)
  const [extractingScenes, setExtractingScenes] = useState(false)
  const [error, setError] = useState("")
  const [generatingStoryImages, setGeneratingStoryImages] = useState(false)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [storyImages, setStoryImages] = useState<Array<{ summary: string; imageData: string }>>([])
  const [characterImages, setCharacterImages] = useState<Array<{ name: string; imageData: string }>>([])
  const [chunkingInfo, setChunkingInfo] = useState<string>("")
  const [processingStep, setProcessingStep] = useState<string>("")
  const [inputMethod, setInputMethod] = useState<"text" | "file">("text")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileParsingStatus, setFileParsingStatus] = useState<"idle" | "parsing" | "success" | "error">("idle")
  const [fileError, setFileError] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Track status of each scene image generation
  const [sceneImageStatus, setSceneImageStatus] = useState<Record<number, "idle" | "loading" | "success" | "error">>({})
  const [sceneErrors, setSceneErrors] = useState<Record<number, string>>({})
  const [imageGenerationProgress, setImageGenerationProgress] = useState(0)
  const [selectedImageStyle, setSelectedImageStyle] = useState<string>("realistic")
  const [customStyleInput, setCustomStyleInput] = useState<string>("")
  const [selectedResolution, setSelectedResolution] = useState<string>("1024x1024")
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null)
  const [editedDescription, setEditedDescription] = useState<string>("")
  const [characterExtractionStatus, setCharacterExtractionStatus] = useState<string>("")
  const [showCharacters, setShowCharacters] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [editMode, setEditMode] = useState<"edit" | "regenerate" | null>(null)

  // Function to extract characters from the story text
  const extractCharacters = async () => {
    if (!storyText.trim()) {
      setError("Please enter a story script first")
      return
    }

    setExtractingCharacters(true)
    setError("")
    setCharacters([])
    setCharacterImages([])
    setCharacterExtractionStatus("Analyzing script to identify characters...")

    try {
      const response = await fetch("/api/extract-characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storyText }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to extract characters");
      }

      const data = await response.json()
      setCharacters(data.characters)
      setCharacterExtractionStatus(`Successfully extracted ${data.characters.length} characters from script`)
      
      // Automatically generate character images
      if (data.characters.length > 0) {
        await generateCharacterImages(data.characters);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred while extracting characters";
      setError(errorMessage);
      setCharacterExtractionStatus("Error extracting characters")
      console.error(err)
    } finally {
      setExtractingCharacters(false)
    }
  }

  // Function to generate character images
  const generateCharacterImages = async (extractedCharacters: Character[]) => {
    if (extractedCharacters.length === 0) {
      setError("No characters available to generate images for")
      return
    }

    setCharacterExtractionStatus("Generating character images...")
    setError("")

    try {
      // Generate images for each character
      const charactersForImages = extractedCharacters.map(char => ({
        name: char.name,
        description: char.description
      }))
      
      const imagesResponse = await fetch("/api/generate-character-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          characters: charactersForImages,
          style: customStyleInput || selectedImageStyle
        }),
      })

      if (!imagesResponse.ok) {
        const errorData = await imagesResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate character images");
      }

      const imagesData = await imagesResponse.json()
      setCharacterImages(imagesData.images)
      setCharacterExtractionStatus(`Character extraction and image generation complete (${imagesData.images.length} images created)`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred while generating images";
      setError(errorMessage);
      setCharacterExtractionStatus("Error generating character images")
      console.error(err)
    }
  }

  const extractStoryScenes = async () => {
    if (!storyText.trim()) {
      setError("Please enter a story script first")
      return
    }

    // Remove the requirement to extract characters first
    // Get character names if characters have been extracted, but don't require it
    const characterNames = characters.length > 0 ? characters.map(char => char.name) : [];

    setExtractingScenes(true)
    setError("")
    setScenes([])
    setStoryImages([])
    setChunkingInfo(`Preparing to analyze story text (${storyText.length} characters)...`)
    setProcessingStep("chunking")

    try {
      const response = await fetch("/api/extract-story-scenes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          storyText, 
          numberOfScenes: storySceneCount,
          characterNames,
          extractCharactersFromText: characterNames.length === 0 // Flag to tell API to extract characters if none provided
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to extract story scenes");
      }

      const data = await response.json()
      setChunkingInfo(`Successfully extracted ${data.scenes.length} scenes from story`)
      setProcessingStep("completed")
      setScenes(data.scenes)
      
      // Only show character image warning if scenes were actually extracted
      if (characterImages.length === 0 && characters.length > 0 && data.scenes.length > 0) {
        setError("Character images need to be generated first before generating scene images")
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred while extracting story scenes";
      setError(errorMessage);
      setProcessingStep("error")
      console.error(err)
    } finally {
      setExtractingScenes(false)
    }
  }

  // Main function to start generating all scene images in parallel
  const generateStoryImages = async () => {
    if (scenes.length === 0) {
      setError("Please extract story scenes first");
      return;
    }

    setGeneratingStoryImages(true);
    setError("");
    setImageGenerationProgress(0);
    
    // Initialize status for all scenes
    const initialStatus: Record<number, "idle" | "loading" | "success" | "error"> = {};
    scenes.forEach((_, index) => {
      initialStatus[index] = "loading";
    });
    setSceneImageStatus(initialStatus);
    setSceneErrors({});

    // Create array to track completed scenes
    let completedScenes = 0;
    const totalScenes = scenes.length;
    
    try {
      // Create a queue of promises to control concurrency
      const queue = new Set();
      const MAX_CONCURRENT_REQUESTS = 5;
      
      // Process all scenes with limited concurrency
      const allScenePromises = [];
      
      for (let i = 0; i < scenes.length; i++) {
        const scenePromise = (async () => {
          // Wait until we have room in the queue
          while (queue.size >= MAX_CONCURRENT_REQUESTS) {
            await Promise.race(queue);
          }
          
          // Create a promise for this scene
          let resolvePromise: () => void;
          const sceneProcessPromise = new Promise<void>(resolve => {
            resolvePromise = resolve;
          });
          
          // Add to the queue first
          queue.add(sceneProcessPromise);
          
          // Process the scene
          try {
            await generateSceneImage(scenes[i], i);
          } catch (err) {
            console.error(`Error in scene ${i} image generation:`, err);
          } finally {
            // Update progress
            completedScenes++;
            const percentage = Math.round((completedScenes / totalScenes) * 100);
            setImageGenerationProgress(percentage);
            
            // Remove from queue and resolve
            queue.delete(sceneProcessPromise);
            resolvePromise!();
          }
        })();
        
        allScenePromises.push(scenePromise);
      }
      
      // Wait for all scenes to be processed
      await Promise.all(allScenePromises);
      
      console.log("All scene images generation completed");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred while generating story images";
      setError(errorMessage);
      console.error("Error in overall image generation process:", err);
    } finally {
      setGeneratingStoryImages(false);
      // Ensure we always set to 100% when done
      setImageGenerationProgress(100);
    }
  }

  // Function to generate image for a single scene
  const generateSceneImage = async (scene: Scene, index: number, customDescription?: string) => {
    if (!scene) return;
    
    // Update status for this scene
    setSceneImageStatus(prev => ({ ...prev, [index]: "loading" }));
    setSceneErrors(prev => ({ ...prev, [index]: "" }));
    
    try {
      // Add a small random delay to avoid hitting rate limits (100-500ms)
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
      
      const sceneToSend = { ...scene };
      
      // If custom description is provided, use it instead
      if (customDescription) {
        sceneToSend.visualDescription = customDescription;
      }
      
      const response = await fetch("/api/generate-story-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          scene: sceneToSend,
          characterImages: characterImages.length > 0 ? characterImages : [], // Send empty array if no character images
          style: customStyleInput || selectedImageStyle,
          resolution: selectedResolution,
          fullScript: storyText // Include the full story script for context
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate scene image");
      }
      
      const data = await response.json();
      
      // Update image data for this specific scene
      setStoryImages(prev => {
        const newImages = [...prev];
        newImages[index] = {
          summary: scene.summary,
          imageData: data.imageData
        };
        return newImages;
      });
      
      setSceneImageStatus(prev => ({ ...prev, [index]: "success" }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate scene image";
      setSceneErrors(prev => ({ ...prev, [index]: errorMessage }));
      setSceneImageStatus(prev => ({ ...prev, [index]: "error" }));
      console.error(`Error generating image for scene ${index}:`, err);
      throw err; // Re-throw to be caught by the wrapper
    }
  };

  // Function to start editing a scene description
  const startEditingScene = (scene: Scene, index: number, mode: "edit" | "regenerate") => {
    setEditingSceneIndex(index);
    setEditedDescription(scene.visualDescription);
    setEditMode(mode);
  };
  
  // Function to modify an existing image with edited description
  const modifyWithReferenceImage = async (scene: Scene, index: number) => {
    try {
      setError("");
      setRegenerating(true);
      console.log("Modifying image for scene", index, "with edited description:", editedDescription);
      console.log("Using existing image as reference");
      
      const response = await fetch("/api/modify-scene-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          scene: {
            ...scene,
            visualDescription: editedDescription
          },
          characterImages,
          existingImage: storyImages[index]?.imageData,
          style: customStyleInput || selectedImageStyle,
          resolution: selectedResolution,
          fullScript: storyText
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to modify scene image");
      }
      
      const data = await response.json();
      
      // Update image data for this specific scene
      setStoryImages(prev => {
        const newImages = [...prev];
        newImages[index] = {
          summary: scene.summary,
          imageData: data.imageData
        };
        return newImages;
      });
      
      setSceneImageStatus(prev => ({ ...prev, [index]: "success" }));
      setEditingSceneIndex(null);
      setEditedDescription("");
      setEditMode(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to modify image";
      setError(errorMessage);
      console.error("Error modifying image:", err);
    } finally {
      setRegenerating(false);
    }
  };
  
  // Function to regenerate an image from scratch with edited description
  const regenerateFromScratch = async (scene: Scene, index: number) => {
    try {
      setError("");
      setRegenerating(true);
      console.log("Regenerating image for scene", index, "with edited description:", editedDescription);
      console.log("Generating completely new image (no reference)");
      
      await generateSceneImage({...scene, visualDescription: editedDescription}, index);
      console.log("Image regeneration completed successfully");
      setEditingSceneIndex(null);
      setEditedDescription("");
      setEditMode(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to regenerate image";
      setError(errorMessage);
      console.error("Error regenerating image:", err);
    } finally {
      setRegenerating(false);
    }
  };

  // Legacy regeneration function - keeping for compatibility
  const regenerateWithEditedDescription = async (scene: Scene, index: number) => {
    if (editMode === "edit") {
      await modifyWithReferenceImage(scene, index);
    } else {
      await regenerateFromScratch(scene, index);
    }
  };

  // Function to handle file upload
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    setUploadedFile(file);
    setFileParsingStatus("parsing");
    setFileError("");
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/parse-docx", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Failed to parse document");
      }
      
      const data = await response.json();
      setStoryText(data.text);
      setFileParsingStatus("success");
    } catch (err) {
      setFileParsingStatus("error");
      setFileError("Error processing document. Please try a different file.");
      console.error("Error parsing document:", err);
    }
  };
  
  // Function to trigger file input click
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Helper function to find character image
  const getCharacterImage = (name: string) => {
    return characterImages.find(img => img.name === name)?.imageData || null;
  }

  // Logic to check if the Generate Scene Images button should be disabled
  const isGenerateSceneImagesDisabled = () => {
    return generatingStoryImages || scenes.length === 0;
  }

  // Function to download a single image
  const downloadImage = (imageData: string, sceneName: string, index: number) => {
    const linkSource = `data:image/png;base64,${imageData}`;
    const downloadLink = document.createElement("a");
    const fileName = `scene_${index + 1}_${sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;

    downloadLink.href = linkSource;
    downloadLink.download = fileName;
    downloadLink.click();
  };

  // Function to download all images as a zip
  const downloadAllImages = async () => {
    if (storyImages.length === 0) return;
    
    const zip = new JSZip();
    const imagesFolder = zip.folder("scene_images");
    
    storyImages.forEach((image, index) => {
      if (image && image.imageData) {
        const fileName = `scene_${index + 1}_${image.summary.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
        const imageData = image.imageData;
        imagesFolder?.file(fileName, imageData, {base64: true});
      }
    });
    
    try {
      const content = await zip.generateAsync({type: "blob"});
      saveAs(content, "story_scene_images.zip");
    } catch (error) {
      console.error("Error creating zip file:", error);
      setError("Failed to create download. Please try again.");
    }
  };

  // Check if any images are available for download
  const hasDownloadableImages = storyImages.some(img => img && img.imageData);

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">AI Story Scene Generator</h1>

        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">{error}</div>}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Story Scene Generator</CardTitle>
            <CardDescription>
              Enter a story script or upload a document to generate character profiles and scene images.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input method selection with improved labels */}
            <div className="border rounded-md">
              <TabsType value={inputMethod} onValueChange={(value) => setInputMethod(value as "text" | "file")}>
                <TabsListType className="grid w-full grid-cols-2">
                  <TabsTriggerType value="text">
                    <FileTextIcon className="h-4 w-4 mr-2" />
                    Text Input
                  </TabsTriggerType>
                  <TabsTriggerType value="file">
                    <FileIcon className="h-4 w-4 mr-2" />
                    Upload Document
                  </TabsTriggerType>
                </TabsListType>
                
                <div className="p-4">
                  {inputMethod === "text" ? (
                    <div>
                      <div className="mb-2 flex justify-between">
                        <span className="text-sm font-medium">Enter your story</span>
                        <span className="text-xs text-gray-500">The longer and more detailed the story, the better the results</span>
                      </div>
            <Textarea
                        placeholder="Enter your story script here..."
                        value={storyText}
                        onChange={(e) => setStoryText(e.target.value)}
                        className="min-h-[150px]"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="mb-2 flex">
                        <span className="text-sm">Upload a Microsoft Word (.docx) document containing your story</span>
                      </div>
                      <div 
                        onClick={triggerFileUpload}
                        className="border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept=".docx"
                          className="hidden"
                        />
                        
                        {fileParsingStatus === "parsing" ? (
                          <div className="text-center">
                            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto mb-2" />
                            <p className="text-sm text-blue-600">Processing document...</p>
                            <p className="text-xs text-gray-500 mt-1">This may take a moment for large files</p>
                          </div>
                        ) : (
                          <Upload className="h-10 w-10 text-gray-400 mb-2" />
                        )}
                        
                        <p className="text-sm text-gray-500">
                          {uploadedFile ? (
                            fileParsingStatus === "success" ? (
                              `"${uploadedFile.name}" successfully parsed`
                            ) : fileParsingStatus === "parsing" ? (
                              "Parsing document..."
                            ) : (
                              `Click to replace "${uploadedFile.name}"`
                            )
                          ) : (
                            "Click to upload or drag & drop a .docx file"
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Only Microsoft Word (.docx) files are supported
                        </p>
                      </div>
                      
                      {fileParsingStatus === "error" && (
                        <Alert variant="destructive" className="bg-red-50">
                          <AlertDescription>{fileError}</AlertDescription>
                        </Alert>
                      )}
                      
                      {fileParsingStatus === "success" && (
                        <div className="bg-green-50 p-3 rounded text-sm text-green-800">
                          <div className="flex">
                            <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Document parsed successfully ({storyText.length} characters)</span>
                          </div>
                        </div>
                      )}
                      
                      {storyText && fileParsingStatus === "success" && (
                        <div className="border rounded-md p-3 max-h-[150px] overflow-y-auto">
                          <p className="text-xs text-gray-500 mb-1">Preview:</p>
                          <p className="text-sm">{storyText.substring(0, 300)}{storyText.length > 300 ? "..." : ""}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsType>
            </div>
            
            {/* Character extraction status */}
            {characterExtractionStatus && (
              <div className={`p-3 rounded text-sm ${
                characterExtractionStatus.includes("Error") ? "bg-red-50 text-red-800" : 
                characterExtractionStatus.includes("complete") ? "bg-green-50 text-green-800" : 
                "bg-blue-50 text-blue-800"
              }`}>
                <div className="flex items-center">
                  {extractingCharacters && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {characterExtractionStatus.includes("complete") && (
                    <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {characterExtractionStatus.includes("Error") && (
                    <svg className="w-4 h-4 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span>{characterExtractionStatus}</span>
                </div>
              </div>
            )}
            
            {/* Character display toggle (collapsible) */}
            {characters.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <div 
                  className="p-3 bg-gray-50 flex justify-between items-center cursor-pointer"
                  onClick={() => setShowCharacters(!showCharacters)}
                >
                  <span className="font-medium">Characters ({characters.length})</span>
                  <svg 
                    className={`w-5 h-5 transition-transform ${showCharacters ? 'transform rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                
                {showCharacters && (
                  <div className="p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {characters.map((character, index) => (
                        <Card key={index} className="overflow-hidden">
                          <CardHeader className="p-3">
                            <CardTitle className="text-base">{character.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-3 pt-0 space-y-3">
                            {/* Character Image */}
                            {getCharacterImage(character.name) ? (
                              <div className="mb-2 flex justify-center">
                                <div className="overflow-hidden rounded-md border w-full max-w-[150px]">
                                  <img 
                                    src={`data:image/png;base64,${getCharacterImage(character.name)}`} 
                                    alt={character.name} 
                                    className="w-full h-auto"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="h-24 bg-gray-100 rounded-md flex items-center justify-center">
                                <UserIcon className="h-8 w-8 text-gray-400" />
                              </div>
                            )}
                            
                            <div>
                              <p className="text-sm text-gray-600">{character.description}</p>
                            </div>
                            
                            <div>
                              <h3 className="text-xs font-medium mb-1">Traits:</h3>
                              <div className="flex flex-wrap gap-1">
                                {character.traits.map((trait, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {trait}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Scene count selection with improved label */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Number of scenes: {storySceneCount}</span>
                <span className="text-xs text-gray-500">More scenes = more detailed story breakdown</span>
              </div>
              <Slider 
                value={[storySceneCount]} 
                min={1} 
                max={500} 
                step={1} 
                onValueChange={(value) => setStorySceneCount(value[0])} 
              />
              <p className="text-xs text-gray-500">Divide your story into {storySceneCount} scenes for image generation. Adjust based on story length.</p>
            </div>

            {/* Image Resolution Selection */}
            <div className="space-y-2 mt-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Image Quality</span>
                <span className="text-xs text-gray-500">Select the quality of your images</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["1024x1024", "Standard Quality", "Square format - good balance of speed and quality"],
                  ["1536x1024", "High Quality", "Landscape (wide) format - better for horizontal scenes"],
                  ["1024x1536", "High Quality", "Portrait (tall) format - better for vertical scenes"],
                  ["auto", "Smart Select", "AI chooses the best format for each scene"]
                ].map(([resolution, quality, description]) => (
                  <div 
                    key={resolution}
                    onClick={() => setSelectedResolution(resolution)}
                    className={`border rounded-md p-3 cursor-pointer text-center transition-colors ${
                      selectedResolution === resolution 
                        ? "bg-blue-50 border-blue-300" 
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium text-sm">{quality}</div>
                    <div className="text-xs text-gray-500 mt-1">{description}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Style Input with improved label */}
            <div className="space-y-2 mt-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Image Style</span>
                <span className="text-xs text-gray-500">Customize the artistic style of your images</span>
              </div>
              <Textarea
                placeholder="Enter a custom style description, e.g. 'oil painting', 'watercolor', 'cyberpunk neon'"
                value={customStyleInput}
                onChange={(e) => setCustomStyleInput(e.target.value)}
                className="h-20"
              />
              <p className="text-xs text-gray-500">Describe the art style you want for your images. Be specific about colors, lighting, mood, or artistic genre.</p>
            </div>

            {/* Chunking information display */}
            {chunkingInfo && !extractingScenes && processingStep !== "chunking" ? (
              <div className={`p-3 rounded text-sm ${
                processingStep === "error" ? "bg-red-50 text-red-800" : 
                processingStep === "completed" ? "bg-green-50 text-green-800" : 
                "bg-blue-50 text-blue-800"
              }`}>
                <div className="flex items-center">
                  {processingStep === "completed" && (
                    <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {processingStep === "error" && (
                    <svg className="w-4 h-4 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span>{chunkingInfo}</span>
                </div>
              </div>
            ) : extractingScenes && processingStep === "chunking" ? (
              <div className="p-3 rounded text-sm bg-blue-50 text-blue-800">
                <div className="flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span>{chunkingInfo}</span>
                </div>
                <div className="mt-2">
                  <div className="w-full bg-blue-200 rounded-full h-1.5">
                    <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                  </div>
                  <p className="text-xs mt-1 text-blue-700">The story is being divided into {storySceneCount} scenes and analyzed</p>
                </div>
              </div>
            ) : null}

            {/* Main action buttons with descriptive section header */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium mb-3">Generate Your Story Images</h3>
              <p className="text-xs text-gray-500 mb-3">Character extraction is optional. You can go directly to Extract Scenes → Generate Scene Images</p>
              
              <div className="flex gap-2">
                <Button 
                  onClick={extractCharacters} 
                  disabled={extractingCharacters || !storyText.trim() || characters.length > 0} 
                  className="flex-1"
                >
                  {extractingCharacters ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extracting Characters...
                    </>
                  ) : characters.length > 0 ? (
                    "Regenerate Characters"
                  ) : (
                    "Extract Characters"
                  )}
                </Button>
                
                <Button 
                  onClick={extractStoryScenes} 
                  disabled={extractingScenes || !storyText.trim() || extractingCharacters} 
                  className="flex-1"
                >
                  {extractingScenes ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing Story...
                </>
              ) : (
                    "Extract Scenes"
                  )}
                </Button>
                
                <Button 
                  onClick={generateStoryImages} 
                  disabled={isGenerateSceneImagesDisabled()} 
                  className="flex-1"
                >
                  {generatingStoryImages ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Images...
                    </>
                  ) : (
                    "Generate Scene Images"
                  )}
                </Button>
              </div>
            </div>
            
            {/* Download all images button */}
            {hasDownloadableImages && (
              <div className="mt-2">
                <Button 
                  onClick={downloadAllImages}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download All Images as ZIP
                </Button>
              </div>
            )}
            
            {/* Progress bar for image generation */}
            {generatingStoryImages && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Generating scene images</span>
                  <span>{imageGenerationProgress}%</span>
                  </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${imageGenerationProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {/* Scenes section with improved header */}
            {scenes.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium">Extracted Scenes ({scenes.length})</h3>
                  <span className="text-xs text-gray-500">Images will be generated for each scene</span>
                </div>
                <div className="space-y-4">
                  {scenes.map((scene, index) => (
                    <Card key={index} className="overflow-hidden">
                      <CardHeader className="p-4">
                        <CardTitle className="text-base">Scene {index + 1}</CardTitle>
                        <CardDescription>{scene.summary}</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="text-sm space-y-2">
                          <div>
                            <span className="font-medium">Setting:</span> {scene.setting}
                          </div>
                          <div>
                            <span className="font-medium">Mood:</span> {scene.mood}
                </div>
                <div>
                            <span className="font-medium">Characters:</span>{" "}
                            {scene.characters.length > 0 ? 
                              scene.characters.map(char => char.name).join(", ") : 
                              "No characters detected in this scene"}
                          </div>
                        </div>
                        
                        {/* Scene image with individual status */}
                        <div className="mt-4">
                          {storyImages[index] ? (
                            <div className="border rounded overflow-hidden">
                              <img 
                                src={`data:image/png;base64,${storyImages[index].imageData}`} 
                                alt={`Scene ${index + 1}`} 
                                className="w-full h-auto"
                              />
                              <div className="p-2 flex justify-end bg-gray-50 border-t">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => downloadImage(storyImages[index].imageData, scene.summary, index)}
                                >
                                  <Download className="h-4 w-4 mr-1" /> Download
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEditingScene(scene, index, "edit")}
                                  className="ml-2"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                  Edit Image
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEditingScene(scene, index, "regenerate")}
                                  className="ml-2"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
                                  Regenerate
                                </Button>
                              </div>
                            </div>
                          ) : sceneImageStatus[index] === "loading" ? (
                            <div className="p-8 border rounded-md text-center bg-gray-50">
                              <Loader2 className="w-10 h-10 mx-auto mb-2 text-blue-500 animate-spin" />
                              <p className="text-sm text-gray-600">Generating scene image...</p>
                            </div>
                          ) : sceneImageStatus[index] === "error" ? (
                            <div className="p-4 border border-red-200 rounded-md bg-red-50">
                              <div className="flex items-center text-red-700 mb-2">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="font-medium">Failed to generate image</span>
                              </div>
                              {sceneErrors[index] && <p className="text-xs text-red-600">{sceneErrors[index]}</p>}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-2 text-xs" 
                                onClick={() => generateSceneImage(scene, index)}
                              >
                                Retry
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-4 p-4 border border-dashed rounded-md text-center text-gray-500">
                              <ImageIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                              <p>No image generated yet</p>
                              <p className="text-xs text-gray-400 mt-1">Click "Generate Scene Images" button above to create all images</p>
                            </div>
                          )}
                          
                          {/* Description edit dialog for regeneration */}
                          {editingSceneIndex === index && (
                            <div className="mt-4 p-4 border rounded-md bg-gray-50">
                              <h4 className="text-sm font-medium mb-2">
                                {editMode === "edit" ? "Edit Image" : "Regenerate Image"}
                              </h4>
                              <p className="text-xs text-gray-500 mb-2">
                                {editMode === "edit" 
                                  ? "Modify the existing image with new details while keeping the overall composition" 
                                  : "Create a completely new image based on your description"}
                              </p>
                              <Textarea
                                value={editedDescription}
                                onChange={(e) => setEditedDescription(e.target.value)}
                                placeholder={editMode === "edit" 
                                  ? "Describe what you want to change in the image" 
                                  : "Enter a new description for the image"}
                                className="min-h-[100px] mb-3"
                                disabled={regenerating}
                              />
                              <div className="flex gap-2 justify-end">
                                {regenerating ? (
                                  <div className="flex items-center text-blue-600">
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    <span className="text-sm">
                                      {editMode === "edit" ? "Modifying image..." : "Regenerating image..."}
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        setEditingSceneIndex(null);
                                        setEditMode(null);
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button 
                                      variant="default" 
                                      size="sm"
                                      onClick={() => {
                                        if (editMode === "edit") {
                                          modifyWithReferenceImage(scene, index);
                                        } else {
                                          regenerateFromScratch(scene, index);
                                        }
                                      }}
                                    >
                                      {editMode === "edit" ? "Apply Changes" : "Generate New Image"}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
