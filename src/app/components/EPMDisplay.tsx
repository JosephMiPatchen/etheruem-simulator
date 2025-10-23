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
import './EPMDisplay.css';

// Import all Pokemon images
import bulbasaur from '../../core/epm/pokemon/bulbasaur.png';
import charmander from '../../core/epm/pokemon/charmander.png';
import hippo from '../../core/epm/pokemon/hippo.png';
import squirtle from '../../core/epm/pokemon/squirtle.png';

// Map image filenames to imported images
const POKEMON_IMAGES: Record<string, string> = {
  'bulbasaur.png': bulbasaur,
  'charmander.png': charmander,
  'hippo.png': hippo,
  'squirtle.png': squirtle,
};

interface EPMDisplayProps {
  account: Account;
}

/**
 * Display component for EPM contract visualization
 */
const EPMDisplay: React.FC<EPMDisplayProps> = ({ account }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [layoutReady, setLayoutReady] = React.useState(false);
  const storage = account.storage as EPMStorage;
  
  // Force layout recalculation after mount to fix initial render glitch
  React.useEffect(() => {
    const timer = setTimeout(() => setLayoutReady(true), 10);
    return () => clearTimeout(timer);
  }, []);
  
  React.useEffect(() => {
    if (!canvasRef.current || !storage || !layoutReady) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get the Pokemon image based on the account's code field
    const imageFilename = account.code || 'squirtle.png'; // Default to squirtle
    const imageSrc = POKEMON_IMAGES[imageFilename];
    
    if (!imageSrc) {
      console.error(`Unknown Pokemon image: ${imageFilename}`);
      return;
    }
    
    // Load the Pokemon PNG
    const img = new Image();
    img.src = imageSrc;
    
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
  }, [storage, layoutReady]);
  
  if (!storage) {
    return <div className="epm-display-error">No EPM contract storage found</div>;
  }
  
  // Calculate color statistics at runtime (not stored in contract)
  const totalPixels = storage.totalPixels;
  const colorCounts = storage.colorCounts;
  const unpaintedCount = totalPixels - Object.values(colorCounts).reduce((sum, count) => sum + count, 0);
  
  // Calculate percentages
  const bluePercent = (colorCounts[PaintColor.BLUE] / totalPixels * 100).toFixed(1);
  const greenPercent = (colorCounts[PaintColor.GREEN] / totalPixels * 100).toFixed(1);
  const redPercent = (colorCounts[PaintColor.RED] / totalPixels * 100).toFixed(1);
  const yellowPercent = (colorCounts[PaintColor.YELLOW] / totalPixels * 100).toFixed(1);
  const unpaintedPercent = (unpaintedCount / totalPixels * 100).toFixed(1);
  
  // Determine if painting is complete
  const isPaintingComplete = unpaintedCount === 0;
  
  return (
    <div className="epm-display">
      <div className="epm-content">
        <div className="epm-canvas-container">
          <canvas ref={canvasRef} className="epm-canvas" />
        </div>
        
        <div className="epm-stats">
          <h3>Paint Statistics</h3>
          
          {/* Pie Chart */}
          <div className="epm-pie-chart">
            <svg viewBox="0 0 100 100" className="pie-svg">
              {/* Calculate pie slices */}
              {(() => {
                let currentAngle = 0;
                const slices = [];
                
                // Helper to create pie slice path
                const createSlice = (percent: number, color: string) => {
                  if (percent === 0) return null;
                  
                  const startAngle = currentAngle;
                  const angle = (percent / 100) * 360;
                  currentAngle += angle;
                  
                  const startX = 50 + 50 * Math.cos((startAngle - 90) * Math.PI / 180);
                  const startY = 50 + 50 * Math.sin((startAngle - 90) * Math.PI / 180);
                  const endX = 50 + 50 * Math.cos((startAngle + angle - 90) * Math.PI / 180);
                  const endY = 50 + 50 * Math.sin((startAngle + angle - 90) * Math.PI / 180);
                  
                  const largeArc = angle > 180 ? 1 : 0;
                  
                  return (
                    <path
                      key={color}
                      d={`M 50 50 L ${startX} ${startY} A 50 50 0 ${largeArc} 1 ${endX} ${endY} Z`}
                      fill={color}
                      stroke="white"
                      strokeWidth="0.5"
                    />
                  );
                };
                
                slices.push(createSlice(parseFloat(bluePercent), '#3b82f6'));
                slices.push(createSlice(parseFloat(greenPercent), '#22c55e'));
                slices.push(createSlice(parseFloat(redPercent), '#ef4444'));
                slices.push(createSlice(parseFloat(yellowPercent), '#eab308'));
                slices.push(createSlice(parseFloat(unpaintedPercent), '#6b7280'));
                
                return slices;
              })()}
            </svg>
          </div>
          
          {/* Color percentages */}
          <div className="epm-color-stats">
            <div className={`stat-item ${isPaintingComplete && storage.winnerColor === 'blue' ? 'winner-row' : ''}`}>
              <span className="stat-color" style={{ backgroundColor: '#3b82f6' }}>🔵</span>
              <span className="stat-label">Blue:</span>
              <span className="stat-value">{bluePercent}%</span>
              {isPaintingComplete && storage.winnerColor === 'blue' && storage.rewardAmount !== undefined && (
                <span className="reward-badge">🏆 Winner +{storage.rewardAmount.toFixed(2)} ETH</span>
              )}
            </div>
            <div className={`stat-item ${isPaintingComplete && storage.winnerColor === 'green' ? 'winner-row' : ''}`}>
              <span className="stat-color" style={{ backgroundColor: '#22c55e' }}>🟢</span>
              <span className="stat-label">Green:</span>
              <span className="stat-value">{greenPercent}%</span>
              {isPaintingComplete && storage.winnerColor === 'green' && storage.rewardAmount !== undefined && (
                <span className="reward-badge">🏆 Winner +{storage.rewardAmount.toFixed(2)} ETH</span>
              )}
            </div>
            <div className={`stat-item ${isPaintingComplete && storage.winnerColor === 'red' ? 'winner-row' : ''}`}>
              <span className="stat-color" style={{ backgroundColor: '#ef4444' }}>🔴</span>
              <span className="stat-label">Red:</span>
              <span className="stat-value">{redPercent}%</span>
              {isPaintingComplete && storage.winnerColor === 'red' && storage.rewardAmount !== undefined && (
                <span className="reward-badge">🏆 Winner +{storage.rewardAmount.toFixed(2)} ETH</span>
              )}
            </div>
            <div className={`stat-item ${isPaintingComplete && storage.winnerColor === 'yellow' ? 'winner-row' : ''}`}>
              <span className="stat-color" style={{ backgroundColor: '#eab308' }}>🟡</span>
              <span className="stat-label">Yellow:</span>
              <span className="stat-value">{yellowPercent}%</span>
              {isPaintingComplete && storage.winnerColor === 'yellow' && storage.rewardAmount !== undefined && (
                <span className="reward-badge">🏆 Winner +{storage.rewardAmount.toFixed(2)} ETH</span>
              )}
            </div>
            <div className="stat-item">
              <span className="stat-color" style={{ backgroundColor: '#6b7280' }}>⚪</span>
              <span className="stat-label">Unpainted:</span>
              <span className="stat-value">{unpaintedPercent}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EPMDisplay;
