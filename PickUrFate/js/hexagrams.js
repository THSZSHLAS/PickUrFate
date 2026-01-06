/**
 * Generates the 64 hexagrams in Fuxi sequence (binary)
 * Lines: 1 = Yang (Solid), 0 = Yin (Broken)
 */
export const hexagramData = [];

const names = [
    "The Creative", "The Receptive", "Difficulty at the Beginning", "Youthful Folly", 
    "Waiting", "Conflict", "The Army", "Holding Together", "Small Taming", "Treading", 
    "Peace", "Standstill", "Fellowship", "Great Possession", "Modesty", "Enthusiasm", 
    "Following", "Work on the Decayed", "Approach", "Contemplation", "Biting Through", 
    "Grace", "Splitting Apart", "Return", "Innocence", "Great Taming", "Mouth Corners", 
    "Great Preponderance", "The Abysmal", "The Clinging", "Influence", "Duration", 
    "Retreat", "Great Power", "Progress", "Darkening of the Light", "The Family", 
    "Opposition", "Obstruction", "Deliverance", "Decrease", "Increase", "Breakthrough", 
    "Coming to Meet", "Gathering Together", "Pushing Upward", "Oppression", "The Well", 
    "Revolution", "The Cauldron", "The Arousing", "The Keeping Still", "Development", 
    "The Marrying Maiden", "Abundance", "The Wanderer", "The Gentle", "The Joyous", 
    "Dispersion", "Limitation", "Inner Truth", "Small Preponderance", "After Completion", 
    "Before Completion"
];

for (let i = 0; i < 64; i++) {
    // Generate lines from binary 0-63
    let lines = [];
    for (let j = 0; j < 6; j++) {
        lines.push((i >> j) & 1);
    }
    hexagramData.push({
        id: i + 1,
        name: names[i] || `Hexagram ${i + 1}`,
        lines: lines // Bottom to top
    });
}