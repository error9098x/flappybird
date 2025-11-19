export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  LOBBY = 'LOBBY',         // Selecting Multiplayer/Singleplayer
  WAITING = 'WAITING',     // Waiting for peer to connect
  JOINING = 'JOINING'      // Entering code
}

export interface Bird {
  y: number;
  velocity: number;
  rotation: number;
}

export interface OpponentBird extends Bird {
  isAlive: boolean;
  score: number;
}

export interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
}

export interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// Network Types
export type NetMessage = 
  | { type: 'START'; seed: number }
  | { type: 'UPDATE'; y: number; r: number; s: number } // y, rotation, score
  | { type: 'DIE'; score: number }
  | { type: 'RESTART' };
