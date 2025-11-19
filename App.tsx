import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import { GameEngine } from './components/GameEngine';
import { Overlay } from './components/Overlay';
import { GameState, NetMessage, OpponentBird } from './types';

const PEER_PREFIX = 'flappy-flight-v1-';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('flappyHighScore');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Multiplayer State
  const [roomCode, setRoomCode] = useState<string>('');
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [opponentScore, setOpponentScore] = useState(0);
  
  // Refs for networking to avoid re-renders
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const opponentBirdRef = useRef<OpponentBird>({ y: 300, velocity: 0, rotation: 0, isAlive: true, score: 0 });
  const gameSeedRef = useRef<number>(Date.now());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  // --- Network Handlers ---
  
  const setupConnection = (conn: DataConnection) => {
    connRef.current = conn;
    
    conn.on('open', () => {
      console.log('Connected to peer!');
      setGameState(GameState.WAITING); // Host waits for guest, guest waits for start
      
      // If we are guest, we are technically ready, but we wait for Host to send START
      // If we are Host, we show a "Start Game" button in Overlay
    });

    conn.on('data', (data: unknown) => {
      const msg = data as NetMessage;
      
      if (msg.type === 'START') {
        gameSeedRef.current = msg.seed;
        setGameState(GameState.PLAYING);
        setScore(0);
        setOpponentScore(0);
        opponentBirdRef.current = { ...opponentBirdRef.current, isAlive: true, score: 0 };
      }
      else if (msg.type === 'UPDATE') {
        // Smooth interpolation could happen here, but for now direct update
        opponentBirdRef.current.y = msg.y;
        opponentBirdRef.current.rotation = msg.r;
        opponentBirdRef.current.score = msg.s;
        opponentBirdRef.current.isAlive = true;
        setOpponentScore(msg.s); // Triggers re-render for score display only if changed
      }
      else if (msg.type === 'DIE') {
        opponentBirdRef.current.isAlive = false;
        opponentBirdRef.current.score = msg.score;
        setOpponentScore(msg.score);
        // If I am already dead, and opponent dies, we can show final results?
        // Current logic: local game over happens independently. 
      }
      else if (msg.type === 'RESTART') {
        // Host requested restart
        if (!isHost) {
           // wait for START message with new seed
        }
      }
    });

    conn.on('close', () => {
      alert('Connection lost');
      handleQuit();
    });
    
    conn.on('error', () => {
      alert('Connection error');
      handleQuit();
    });
  };

  const handleCreateGame = () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    setRoomCode(code);
    setIsMultiplayer(true);
    setIsHost(true);
    setGameState(GameState.WAITING);

    const peer = new Peer(PEER_PREFIX + code);
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My peer ID is: ' + id);
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
      // PeerJS doesn't trigger 'open' on the incoming connection immediately sometimes,
      // but usually it does.
    });
    
    peer.on('error', (err) => {
        console.error(err);
        alert("Could not create room (maybe ID taken?). Try again.");
        handleQuit();
    });
  };

  const handleJoinGame = (code: string) => {
    setIsMultiplayer(true);
    setIsHost(false);
    setGameState(GameState.JOINING);
    
    const peer = new Peer(); // Auto-gen ID for guest
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + code.toUpperCase());
      setupConnection(conn);
    });

    peer.on('error', (err) => {
        console.error(err);
        alert("Could not connect. Check code.");
        handleQuit();
    });
  };

  const handleQuit = useCallback(() => {
    peerRef.current?.destroy();
    peerRef.current = null;
    connRef.current = null;
    setIsMultiplayer(false);
    setIsHost(false);
    setGameState(GameState.START);
  }, []);

  // --- Game Logic Handlers ---

  const handleStart = useCallback(() => {
    if (isMultiplayer) {
      if (isHost && connRef.current) {
        const seed = Date.now();
        gameSeedRef.current = seed;
        connRef.current.send({ type: 'START', seed });
        setGameState(GameState.PLAYING);
        setScore(0);
        setOpponentScore(0);
        opponentBirdRef.current.isAlive = true;
      }
    } else {
      setGameState(GameState.PLAYING);
      setScore(0);
    }
  }, [isMultiplayer, isHost]);

  const handleGameOver = useCallback((finalScore: number) => {
    setGameState(GameState.GAME_OVER);
    
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('flappyHighScore', finalScore.toString());
    }

    if (isMultiplayer && connRef.current) {
      connRef.current.send({ type: 'DIE', score: finalScore });
    }
  }, [highScore, isMultiplayer]);

  const handleScoreUpdate = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);

  // Called by GameEngine every frame to sync multiplayer data
  const handleNetworkUpdate = useCallback((y: number, rot: number, s: number) => {
    if (isMultiplayer && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'UPDATE', y, r: rot, s });
    }
  }, [isMultiplayer]);

  const handleRestart = useCallback(() => {
    if (isMultiplayer) {
        // If host restarts, they re-trigger start flow
        if (isHost) {
            handleStart();
        } else {
            // Guest waits
            // Show "Waiting for host"
        }
    } else {
        setGameState(GameState.START);
        setScore(0);
    }
  }, [isMultiplayer, isHost, handleStart]);

  return (
    <div className="relative w-full h-screen bg-slate-900 flex justify-center items-center overflow-hidden">
      <div className="relative w-full max-w-md h-full max-h-[800px] shadow-2xl bg-sky-300 overflow-hidden md:rounded-xl border-4 border-slate-800">
        
        <GameEngine 
          gameState={gameState}
          onGameOver={handleGameOver}
          onScoreUpdate={handleScoreUpdate}
          isMultiplayer={isMultiplayer}
          gameSeed={gameSeedRef.current}
          opponentBirdRef={opponentBirdRef}
          onNetworkUpdate={handleNetworkUpdate}
        />

        {/* UI Layer */}
        <div className="absolute inset-0 pointer-events-none">
          {gameState === GameState.PLAYING && (
            <div className="absolute top-10 w-full flex flex-col items-center pointer-events-none z-10">
               <div className="flex gap-8">
                  <div className="text-center">
                     <span className="text-sm font-bold text-white drop-shadow-md block">YOU</span>
                     <span className="text-6xl font-bold text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] stroke-black">
                       {score}
                     </span>
                  </div>
                  {isMultiplayer && (
                     <div className="text-center opacity-80">
                        <span className="text-sm font-bold text-red-200 drop-shadow-md block">P2</span>
                        <span className="text-6xl font-bold text-red-100 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] stroke-black">
                          {opponentScore}
                        </span>
                     </div>
                  )}
               </div>
            </div>
          )}

          <Overlay 
            gameState={gameState}
            score={score}
            highScore={highScore}
            onStart={handleStart}
            onRestart={handleRestart}
            
            // Multiplayer props
            isMultiplayer={isMultiplayer}
            isHost={isHost}
            roomCode={roomCode}
            opponentScore={opponentScore}
            onCreateGame={handleCreateGame}
            onJoinGame={handleJoinGame}
            onQuit={handleQuit}
            isConnected={!!connRef.current?.open}
          />
        </div>
      </div>
    </div>
  );
};

export default App;