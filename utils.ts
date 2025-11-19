/**
 * A simple Linear Congruential Generator (LCG) for seeded random numbers.
 * Essential for multiplayer games to ensure both players see the same pipe configuration.
 */
export class SeededRNG {
    private seed: number;
  
    constructor(seed: number) {
      this.seed = seed;
    }
  
    /**
     * Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).
     */
    next(): number {
      // LCG constants (using values similar to glibc)
      this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
      return this.seed / 2147483648;
    }
  
    /**
     * Helper to generate integer range [min, max]
     */
    range(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
  }