/**
 * EPMDisplay Component
 * 
 * Pure display component that visualizes an EPM contract account.
 * Takes an Account with EPM storage and renders the painted Pokemon.
 * 
 * This component handles all the visual rendering logic:
 * - Loading the Pokemon PNG
 * - Reading original pixel colors
 * - Tinting pixels based on paint colors
 * - Preserving original shading with color tint
 */

import React from 'react';
import { Account } from '../../types/types';
import { EPMStorage, PaintColor } from '../../core/epm/EPM';
import pokemonImage from '../../core/epm/image_to_paint.png';
import './EPMDisplay.css';

interface EPMDisplayProps {
  account: Account;
}

/**
 * Display component for EPM contract visualization
 */
const EPMDisplay: React.FC<EPMDisplayProps> = ({ account }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const storage = account.storage as EPMStorage;
  
  React.useEffect(() => {
    if (!canvasRef.current || !storage) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Load the Pokemon PNG
    const img = new Image();
    img.src = pokemonImage;
    
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Create a temporary canvas to read the original image pixels
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      tempCtx.drawImage(img, 0, 0);
      
      // Get the image data to read original pixel colors
      const originalImageData = tempCtx.getImageData(0, 0, img.width, img.height);
      const originalPixels = originalImageData.data;
      
      // Calculate pixel size for grid mapping
      const pixelWidth = img.width / storage.width;
      const pixelHeight = img.height / storage.height;
      
      // Render each painted grid cell
      for (let y = 0; y < storage.height; y++) {
        for (let x = 0; x < storage.width; x++) {
          const colorId = storage.pixels[y][x];
          
          // Only render painted pixels
          if (colorId > 0) {
            // Get the tint color RGB values
            let tintR = 0, tintG = 0, tintB = 0;
            switch (colorId) {
              case PaintColor.BLUE: tintR = 59; tintG = 130; tintB = 246; break;
              case PaintColor.GREEN: tintR = 16; tintG = 185; tintB = 129; break;
              case PaintColor.RED: tintR = 239; tintG = 68; tintB = 68; break;
              case PaintColor.YELLOW: tintR = 251; tintG = 191; tintB = 36; break;
            }
            
            // Calculate pixel bounds for this grid cell
            const startX = Math.floor(x * pixelWidth);
            const startY = Math.floor(y * pixelHeight);
            const endX = Math.ceil((x + 1) * pixelWidth);
            const endY = Math.ceil((y + 1) * pixelHeight);
            
            // Tint each pixel in this grid cell
            for (let py = startY; py < endY && py < img.height; py++) {
              for (let px = startX; px < endX && px < img.width; px++) {
                const idx = (py * img.width + px) * 4;
                const origR = originalPixels[idx];
                const origG = originalPixels[idx + 1];
                const origB = originalPixels[idx + 2];
                const alpha = originalPixels[idx + 3];
                
                // Only tint non-transparent pixels
                if (alpha > 0) {
                  // Calculate brightness of original pixel (0-1)
                  const brightness = (origR + origG + origB) / (3 * 255);
                  
                  // Add minimum brightness bias so dark pixels show color
                  // This makes black outlines appear as dark colored instead of pure black
                  const minBrightness = 0.2; // 20% minimum brightness
                  const adjustedBrightness = minBrightness + (brightness * (1 - minBrightness));
                  
                  // Apply tint while preserving brightness gradient
                  const newR = tintR * adjustedBrightness;
                  const newG = tintG * adjustedBrightness;
                  const newB = tintB * adjustedBrightness;
                  
                  // Draw the tinted pixel
                  ctx.fillStyle = `rgb(${newR}, ${newG}, ${newB})`;
                  ctx.fillRect(px, py, 1, 1);
                }
              }
            }
          }
        }
      }
    };
  }, [storage]);
  
  if (!storage) {
    return <div className="epm-display-error">No EPM contract storage found</div>;
  }
  
  return (
    <div className="epm-display">
      <canvas ref={canvasRef} className="epm-canvas" />
    </div>
  );
};

export default EPMDisplay;
