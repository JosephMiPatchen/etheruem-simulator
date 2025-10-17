/**
 * Utility for generating memorable node IDs using military phonetic alphabet
 */

// NATO phonetic alphabet
const PHONETIC_WORDS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'X-ray', 'Yankee', 'Zulu'
];

/**
 * Generates a random node ID using a military phonetic word
 */
export function generateNodeId(): string {
  // Pick a random word from the phonetic alphabet
  const randomIndex = Math.floor(Math.random() * PHONETIC_WORDS.length);
  return PHONETIC_WORDS[randomIndex];
}

/**
 * Generates an array of unique node IDs
 * @throws Error if count exceeds the number of available phonetic words
 */
export function generateUniqueNodeIds(count: number): string[] {
  if (count > PHONETIC_WORDS.length) {
    throw new Error(`Cannot generate more than ${PHONETIC_WORDS.length} unique node IDs without duplicates`);
  }
  
  // Simply take the first N words from the phonetic alphabet
  // This ensures deterministic naming: first node is always Alpha, second is Bravo, etc.
  return PHONETIC_WORDS.slice(0, count);
}
