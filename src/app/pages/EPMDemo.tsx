/**
 * EPM Demo Page
 * 
 * Demonstrates the EPM (Ethereum Painting Machine) contract with mock transactions.
 * 
 * This page:
 * 1. Loads the Pokemon PNG and creates an EPM contract account
 * 2. Executes mock paint transactions using EPM.executeTransaction()
 * 3. Displays the result using the EPMDisplay component
 * 
 * This demonstrates the clean interface that will be used for blockchain integration.
 */

import React, { useState, useEffect } from 'react';
import { Account } from '../../types/types';
import { EPM } from '../../core/epm/EPM';
import EPMDisplay from '../components/EPMDisplay';
import './EPMDemo.css';

// Import Pokemon image for loading pixel data
import hippoImage from '../../core/epm/pokemon/hippo.png';

/**
 * Demo wrapper that creates an EPM contract and executes mock transactions
 */
const EPMDemo: React.FC = () => {
  const [contractAccount, setContractAccount] = useState<Account | null>(null);
  
  useEffect(() => {
    // Load the Pokemon PNG and extract pixel data
    const img = new Image();
    img.src = hippoImage;
    
    img.onload = () => {
      // Create canvas to read pixel data
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // Get pixel data
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const pixels = imageData.data;
      
      // Create grid based on alpha channel (transparency)
      // High resolution for complete coverage (128x128)
      const gridSize = 128;
      const scaleX = img.width / gridSize;
      const scaleY = img.height / gridSize;
      
      const grid: number[][] = [];
      for (let y = 0; y < gridSize; y++) {
        const row: number[] = [];
        for (let x = 0; x < gridSize; x++) {
          // Sample the original image at this scaled position
          const srcX = Math.floor(x * scaleX);
          const srcY = Math.floor(y * scaleY);
          const idx = (srcY * img.width + srcX) * 4;
          const alpha = pixels[idx + 3];
          
          // If alpha > 128, pixel is part of Pokemon (paintable)
          row.push(alpha > 128 ? 1 : 0);
        }
        grid.push(row);
      }
      
      // Initialize EPM contract storage
      const initialStorage = EPM.initialize(grid);
      
      // Create EPM contract account
      // The 'code' field stores the Pokemon image filename
      let account: Account = {
        address: '0xEPM_CONTRACT',
        balance: 0,
        nonce: 0,
        code: 'hippo.png', // Specifies which Pokemon to paint
        storage: initialStorage,
        codeHash: 'epm-v1'
      };
      
      // Mock transactions to paint the Pokemon
      const transactions = [
        { color: 'red', eth: 50, blockHash: '0xfff' },
      ];
      
      // Execute each transaction using the clean EPM interface
      for (const tx of transactions) {
        // Create mock Ethereum transaction
        const ethTx = {
          from: '0xMOCK_SENDER',
          to: account.address,
          value: tx.eth,
          nonce: 0,
          data: JSON.stringify({ color: tx.color }),
          publicKey: 'mock',
          signature: 'mock',
          timestamp: Date.now(),
          txid: `mock-${tx.color}`
        };
        
        // Execute transaction with block hash for entropy
        const result = EPM.executeTransaction(account, ethTx, tx.blockHash);
        
        if (result.success) {
          account = result.account;
          console.log(`✅ Painted with ${tx.color}: ${tx.eth} ETH`);
        } else {
          console.error(`❌ Failed to paint with ${tx.color}: ${result.error}`);
        }
      }
      
      // Set the final contract account
      setContractAccount(account);
    };
  }, []);
  
  if (!contractAccount) {
    return <div className="epm-demo-page">Loading EPM...</div>;
  }
  
  return (
    <div className="epm-demo-page">
      <h1>EPM Demo</h1>
      <p>Ethereum Painting Machine - Collaborative Pokemon Painting</p>
      <EPMDisplay account={contractAccount} />
      <div className="epm-stats">
        <p>Contract Balance: {contractAccount.balance} ETH</p>
        <p>Contract Address: {contractAccount.address}</p>
      </div>
    </div>
  );
};

export default EPMDemo;
