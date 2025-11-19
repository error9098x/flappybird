import React, { useRef, useEffect, useCallback } from 'react';
import { GameState, Bird, Pipe, Cloud, Particle, OpponentBird } from '../types';
import { SeededRNG } from '../utils';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRAVITY,
  JUMP_STRENGTH,
  TERMINAL_VELOCITY,
  PIPE_SPEED,
  PIPE_SPAWN_RATE,
  PIPE_WIDTH,
  PIPE_GAP,
  BIRD_X,
  BIRD_RADIUS,
  GROUND_HEIGHT,
  COLOR_SKY,
  COLOR_BIRD,
  COLOR_PIPE,
  COLOR_GROUND,
  COLOR_GRASS
} from '../constants';

interface GameEngineProps {
  gameState: GameState;
  onGameOver: (score: number) => void;
  onScoreUpdate: (score: number) => void;
  
  // Multiplayer props
  isMultiplayer?: boolean;
  gameSeed?: number;
  opponentBirdRef?: React.MutableRefObject<OpponentBird>;
  onNetworkUpdate?: (y: number, rot: number, score: number) => void;
}

export const GameEngine: React.FC<GameEngineProps> = ({
  gameState,
  onGameOver,
  onScoreUpdate,
  isMultiplayer = false,
  gameSeed = 0,
  opponentBirdRef,
  onNetworkUpdate
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  
  // Mutable Game State Refs
  const birdRef = useRef<Bird>({ y: CANVAS_HEIGHT / 2, velocity: 0, rotation: 0 });
  const pipesRef = useRef<Pipe[]>([]);
  const cloudsRef = useRef<Cloud[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const scoreRef = useRef(0);
  const framesRef = useRef(0);
  const groundXRef = useRef(0);
  
  // RNG Ref
  const rngRef = useRef<SeededRNG | null>(null);

  // Initialize Clouds (Client-side random is fine for clouds)
  useEffect(() => {
    const initialClouds: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      initialClouds.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * (CANVAS_HEIGHT / 2),
        scale: 0.5 + Math.random() * 0.5,
        speed: 0.5 + Math.random() * 0.5
      });
    }
    cloudsRef.current = initialClouds;
  }, []);

  const resetGame = useCallback(() => {
    birdRef.current = { y: CANVAS_HEIGHT / 2, velocity: 0, rotation: 0 };
    pipesRef.current = [];
    scoreRef.current = 0;
    framesRef.current = 0;
    particlesRef.current = [];
    
    // Reset RNG with shared seed for multiplayer, or random for single
    const seed = isMultiplayer ? gameSeed : Date.now();
    rngRef.current = new SeededRNG(seed);
  }, [isMultiplayer, gameSeed]);

  // Effect to handle GameState changes
  useEffect(() => {
    if (gameState === GameState.START || gameState === GameState.WAITING) {
      resetGame();
    }
    // If playing started, we rely on the reset having happened
    if (gameState === GameState.PLAYING && pipesRef.current.length === 0) {
        resetGame();
    }
  }, [gameState, resetGame]);

  const jump = useCallback(() => {
    if (gameState !== GameState.PLAYING) return;
    
    birdRef.current.velocity = JUMP_STRENGTH;
    
    // Add jump particles
    for(let i=0; i<5; i++) {
      particlesRef.current.push({
        x: BIRD_X - 10,
        y: birdRef.current.y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() * 2) + 1,
        life: 1.0,
        color: '#FFF'
      });
    }
  }, [gameState]);

  // The Main Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Initialize RNG if null (fallback)
    if (!rngRef.current) rngRef.current = new SeededRNG(Date.now());

    const render = () => {
      // 1. Update Logic
      if (gameState === GameState.PLAYING) {
        framesRef.current++;
        
        // Update Bird
        birdRef.current.velocity += GRAVITY;
        if (birdRef.current.velocity > TERMINAL_VELOCITY) {
            birdRef.current.velocity = TERMINAL_VELOCITY;
        }
        birdRef.current.y += birdRef.current.velocity;

        // Calculate Rotation
        const targetRotation = Math.min(Math.PI / 2, Math.max(-Math.PI / 4, (birdRef.current.velocity * 0.1)));
        birdRef.current.rotation += (targetRotation - birdRef.current.rotation) * 0.1;

        // Ground Movement
        groundXRef.current = (groundXRef.current - PIPE_SPEED) % CANVAS_WIDTH;

        // Spawn Pipes using Seeded RNG
        if (framesRef.current % PIPE_SPAWN_RATE === 0) {
          const minHeight = 50;
          const maxHeight = CANVAS_HEIGHT - GROUND_HEIGHT - PIPE_GAP - minHeight;
          // Use seeded RNG for pipe height
          const randomHeight = rngRef.current!.range(minHeight, maxHeight);
          
          pipesRef.current.push({
            x: CANVAS_WIDTH,
            topHeight: randomHeight,
            passed: false
          });
        }

        // Update Pipes & Collision
        for (let i = pipesRef.current.length - 1; i >= 0; i--) {
          const p = pipesRef.current[i];
          p.x -= PIPE_SPEED;

          // Remove off-screen pipes
          if (p.x + PIPE_WIDTH < 0) {
            pipesRef.current.splice(i, 1);
            continue;
          }

          // Score counting
          if (!p.passed && p.x + PIPE_WIDTH < BIRD_X - BIRD_RADIUS) {
            p.passed = true;
            scoreRef.current += 1;
            onScoreUpdate(scoreRef.current);
          }

          // Collision Detection
          if (
            BIRD_X + BIRD_RADIUS - 4 > p.x && 
            BIRD_X - BIRD_RADIUS + 4 < p.x + PIPE_WIDTH && 
            (birdRef.current.y - BIRD_RADIUS + 4 < p.topHeight || 
             birdRef.current.y + BIRD_RADIUS - 4 > p.topHeight + PIPE_GAP)
          ) {
            onGameOver(scoreRef.current);
          }
        }

        // Ground/Ceiling Collision
        if (birdRef.current.y + BIRD_RADIUS >= CANVAS_HEIGHT - GROUND_HEIGHT) {
           onGameOver(scoreRef.current);
        }
        if (birdRef.current.y - BIRD_RADIUS <= 0) {
            birdRef.current.y = BIRD_RADIUS;
            birdRef.current.velocity = 0;
        }

        // Send Network Update
        if (isMultiplayer && onNetworkUpdate && framesRef.current % 2 === 0) { // Throttle slightly
            onNetworkUpdate(birdRef.current.y, birdRef.current.rotation, scoreRef.current);
        }

      } else if (gameState === GameState.START || gameState === GameState.WAITING) {
         // Idle animation
         const time = Date.now() / 300;
         birdRef.current.y = (CANVAS_HEIGHT / 2) + Math.sin(time) * 10;
         birdRef.current.rotation = 0;
         groundXRef.current = (groundXRef.current - PIPE_SPEED) % CANVAS_WIDTH;
      }

      // Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.05;
          if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // Update Clouds
      cloudsRef.current.forEach(cloud => {
          cloud.x -= cloud.speed;
          if (cloud.x + 100 < 0) {
              cloud.x = CANVAS_WIDTH + 50;
              cloud.y = Math.random() * (CANVAS_HEIGHT / 2);
          }
      });


      // 2. Draw Logic
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Sky Gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, COLOR_SKY);
      gradient.addColorStop(1, '#87CEEB');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Clouds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      cloudsRef.current.forEach(cloud => {
          ctx.save();
          ctx.translate(cloud.x, cloud.y);
          ctx.scale(cloud.scale, cloud.scale);
          ctx.beginPath();
          ctx.arc(0, 0, 30, 0, Math.PI * 2);
          ctx.arc(25, -10, 35, 0, Math.PI * 2);
          ctx.arc(50, 0, 25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
      });

      // Draw Pipes
      pipesRef.current.forEach(p => {
        const pipeGradient = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
        pipeGradient.addColorStop(0, '#558C22');
        pipeGradient.addColorStop(0.1, COLOR_PIPE);
        pipeGradient.addColorStop(0.8, COLOR_PIPE);
        pipeGradient.addColorStop(1, '#558C22');

        ctx.fillStyle = pipeGradient;
        
        // Top pipe
        ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topHeight);
        ctx.fillRect(p.x - 2, p.topHeight - 20, PIPE_WIDTH + 4, 20);
        ctx.strokeStyle = '#2d4c12';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 2, p.topHeight - 20, PIPE_WIDTH + 4, 20);

        // Bottom Pipe
        const bottomPipeY = p.topHeight + PIPE_GAP;
        ctx.fillStyle = pipeGradient;
        ctx.fillRect(p.x, bottomPipeY, PIPE_WIDTH, CANVAS_HEIGHT - bottomPipeY);
        ctx.fillRect(p.x - 2, bottomPipeY, PIPE_WIDTH + 4, 20);
        ctx.strokeRect(p.x - 2, bottomPipeY, PIPE_WIDTH + 4, 20);
      });

      // Draw Ground
      ctx.fillStyle = COLOR_GROUND;
      ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);
      
      ctx.fillStyle = COLOR_GRASS;
      ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, 5);
      ctx.strokeStyle = '#654321';
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_HEIGHT - GROUND_HEIGHT);
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_HEIGHT);
      ctx.stroke();

      // Moving Ground Detail
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, CANVAS_HEIGHT - GROUND_HEIGHT + 5, CANVAS_WIDTH, GROUND_HEIGHT - 5);
      ctx.clip();
      
      ctx.strokeStyle = '#D0C874';
      ctx.lineWidth = 2;
      for (let i = groundXRef.current; i < CANVAS_WIDTH + 20; i += 20) {
          ctx.beginPath();
          ctx.moveTo(i, CANVAS_HEIGHT - GROUND_HEIGHT);
          ctx.lineTo(i - 10, CANVAS_HEIGHT);
          ctx.stroke();
      }
      ctx.restore();

      // Draw Opponent Bird (Ghost)
      if (isMultiplayer && opponentBirdRef && opponentBirdRef.current.isAlive) {
        const opp = opponentBirdRef.current;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.translate(BIRD_X, opp.y);
        ctx.rotate(opp.rotation);
        
        // Red/Ghost color for opponent
        ctx.fillStyle = '#FF6B6B'; 
        ctx.beginPath();
        ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'white';
        ctx.stroke();
        
        // Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(6, -6, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Beak
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.moveTo(8, 2);
        ctx.lineTo(18, 6);
        ctx.lineTo(8, 10);
        ctx.fill();
        
        ctx.restore();
      }

      // Draw Particles
      particlesRef.current.forEach(p => {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
      });

      // Draw Player Bird
      ctx.save();
      ctx.translate(BIRD_X, birdRef.current.y);
      ctx.rotate(birdRef.current.rotation);

      ctx.fillStyle = COLOR_BIRD;
      ctx.beginPath();
      ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'black';
      ctx.stroke();

      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(6, -6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.arc(8, -6, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#F8F8FF';
      ctx.beginPath();
      ctx.ellipse(-4, 4, 8, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FF6347';
      ctx.beginPath();
      ctx.moveTo(8, 2);
      ctx.lineTo(18, 6);
      ctx.lineTo(8, 10);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [gameState, onGameOver, onScoreUpdate, isMultiplayer, opponentBirdRef, onNetworkUpdate]);

  // Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      jump();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    const canvas = canvasRef.current;
    if (canvas) {
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('mousedown', jump);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (canvas) {
          canvas.removeEventListener('touchstart', handleTouchStart);
          canvas.removeEventListener('mousedown', jump);
      }
    };
  }, [jump]);

  return (
    <canvas 
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="w-full h-full object-contain bg-sky-300 block"
      style={{ touchAction: 'none' }}
    />
  );
};