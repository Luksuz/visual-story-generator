import sharp from 'sharp';

export async function createImageMosaic(images: Array<{ name: string, imageData: string }>, columns: number) {
  try {
    // Define fixed dimensions for all images
    const width = 512;
    const height = 512;
    const labelHeight = 40;
    const totalHeight = height + labelHeight;
    
    // Convert base64 images to sharp instances
    const imageBuffers = await Promise.all(
      images.map(async ({ name, imageData }, index) => {
        try {
          // Decode base64
          const buffer = Buffer.from(imageData, 'base64');
          
          // Create a text label with the character's name
          const labelSvg = Buffer.from(`
            <svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
              <rect width="${width}" height="${labelHeight}" fill="white" />
              <text x="50%" y="50%" font-family="sans-serif" font-size="20" text-anchor="middle" dominant-baseline="middle" fill="black">${name}</text>
            </svg>
          `);
          
          // Process the image to ensure it's in a supported format
          const processedImageBuffer = await sharp(buffer)
            .resize(width, height, { fit: 'cover' })
            .png() // Explicitly convert to PNG format
            .toBuffer();
          
          // Composite the image and label
          const imageWithLabel = await sharp({
            create: {
              width: width,
              height: totalHeight,
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
          })
            .composite([
              { input: processedImageBuffer, top: 0, left: 0 },
              { input: await sharp(labelSvg).png().toBuffer(), top: height, left: 0 }
            ])
            .png()
            .toBuffer();
            
          return imageWithLabel;
        } catch (err) {
          console.error(`Error processing image ${index} for ${name}:`, err);
          // Create a fallback image with just the name
          return await sharp({
            create: {
              width: width,
              height: totalHeight,
              channels: 4,
              background: { r: 200, g: 200, b: 200, alpha: 1 }
            }
          })
            .composite([
              {
                input: Buffer.from(`
                  <svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
                    <rect width="${width}" height="${totalHeight}" fill="#eeeeee" />
                    <text x="50%" y="50%" font-family="sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle" fill="black">${name}</text>
                    <text x="50%" y="70%" font-family="sans-serif" font-size="16" text-anchor="middle" dominant-baseline="middle" fill="gray">Image unavailable</text>
                  </svg>
                `),
                top: 0,
                left: 0
              }
            ])
            .png()
            .toBuffer();
        }
      })
    );

    // If no images were processed successfully, throw an error
    if (imageBuffers.length === 0) {
      throw new Error("No valid images to create mosaic");
    }

    // Calculate grid dimensions
    const rows = Math.ceil(images.length / columns);
    
    // Prepare the inputs for the composite operation
    const compositeInputs = imageBuffers.map((buffer: Buffer, index: number) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      return {
        input: buffer,
        top: row * totalHeight,
        left: col * width
      };
    });
    
    // Create the mosaic
    const mosaic = await sharp({
      create: {
        width: width * columns,
        height: totalHeight * rows,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite(compositeInputs)
      .png() // Ensure output is PNG
      .toBuffer();
      
    // Return as base64
    return mosaic.toString('base64');
  } catch (error) {
    console.error("Error creating image mosaic:", error);
    throw error;
  }
} 