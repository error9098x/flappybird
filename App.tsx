
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Peer } from 'peerjs';
import type { DataConnection, PeerOptions } from 'peerjs';
import { GameEngine } from './components/GameEngine';
import { Overlay } from './components/Overlay';
import { GameState, NetMessage, OpponentBird } from './types';

const PEER_PREFIX = 'flappy-flight-v1-';

// Declare global to prevent GC and for debugging
declare global {
  interface Window {
    peer: Peer | null;
  }
}

// Critical: Use Google's public STUN servers to allow connections across different networks
const PEER_CONFIG: PeerOptions = {
  debug: 2, // Log warnings and errors
  config: {
    iceServers: [
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};

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
  const [isConnected, setIsConnected] = useState(false);
  
  // Refs for networking to avoid re-renders
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const opponentBirdRef = useRef<OpponentBird>({ y: 300, velocity: 0, rotation: 0, isAlive: true, score: 0 });
  const gameSeedRef = useRef<number>(Date.now());

  // Cleanup on unmount
  useEffect(() => {
    const cleanup = () => {
      connRef.current?.close();
      peerRef.current?.destroy();
      window.peer = null;
    };

    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, []);

  // --- Network Handlers ---
  
  const setupConnection = (conn: DataConnection) => {
    connRef.current = conn;
    
    const handleOpen = () => {
      console.log('State: Connection OPENED');
      // Only update state if we aren't already connected (prevent dupes)
      setIsConnected((prev) => {
        if (prev) return prev;
        
        // If we are the Guest, we enter WAITING state upon connection.
        // If we are Host, we stay in WAITING state until we click Start.
        setGameState(GameState.WAITING);
        return true;
      });
    };

    // --- ROBUST MONITORING ---
    // Monitor the low-level ICE state. If ICE connects but PeerJS 'open' event misses, we force it.
    const monitorInterval = setInterval(() => {
        if (!conn.peerConnection) return;
        
        const iceState = conn.peerConnection.iceConnectionState;
        console.log(`[Connection Monitor] ICE: ${iceState}, Open: ${conn.open}`);

        if (iceState === 'connected' || iceState === 'completed') {
            // The network path is open. 
            // If React state says not connected, we wait a split second and force it.
            if (!conn.open) {
                 console.log('[Connection Monitor] ICE Connected but DataChannel closed. waiting...');
            } else {
                 // Data channel says open, ensure UI reflects it
                 handleOpen();
            }
        }
        
        if (iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed') {
            console.warn('[Connection Monitor] Connection died');
            clearInterval(monitorInterval);
            setIsConnected(false);
            if (gameState !== GameState.START && gameState !== GameState.LOBBY) {
                 alert('Connection lost');
                 handleQuit();
            }
        }
    }, 1000);

    conn.on('close', () => clearInterval(monitorInterval));
    conn.on('error', () => clearInterval(monitorInterval));

    // CRITICAL FIX: Check if connection is ALREADY open (Race Condition Fix)
    if (conn.open) {
      console.log('State: Connection was ALREADY OPEN');
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (data: unknown) => {
      const msg = data as NetMessage;
      
      if (msg.type === 'START') {
        console.log('Received START command');
        gameSeedRef.current = msg.seed;
        setGameState(GameState.PLAYING);
        setScore(0);
        setOpponentScore(0);
        opponentBirdRef.current = { ...opponentBirdRef.current, isAlive: true, score: 0 };
      }
      else if (msg.type === 'UPDATE') {
        opponentBirdRef.current.y = msg.y;
        opponentBirdRef.current.rotation = msg.r;
        opponentBirdRef.current.score = msg.s;
        opponentBirdRef.current.isAlive = true;
        setOpponentScore(msg.s);
      }
      else if (msg.type === 'DIE') {
        opponentBirdRef.current.isAlive = false;
        opponentBirdRef.current.score = msg.score;
        setOpponentScore(msg.score);
      }
      else if (msg.type === 'RESTART') {
        // Signal received
      }
    });

    conn.on('close', () => {
      console.warn('Peer connection closed');
      setIsConnected(false);
    });
    
    conn.on('error', (err) => {
      console.error('Connection Error:', err);
      setIsConnected(false);
    });
  };

  const handleCreateGame = () => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    setRoomCode(code);
    setIsMultiplayer(true);
    setIsHost(true);
    setIsConnected(false);
    setGameState(GameState.WAITING);

    try {
        // Pass config with STUN servers
        const peer = new Peer(PEER_PREFIX + code, PEER_CONFIG);
        peerRef.current = peer;
        window.peer = peer; // Prevent GC

        peer.on('open', (id) => {
          console.log('Host ID ready:', id);
        });

        peer.on('connection', (conn) => {
          console.log('Incoming connection from guest...');
          setupConnection(conn);
        });
        
        peer.on('error', (err) => {
            console.error('Peer Error:', err);
            if (err.type === 'unavailable-id') {
                alert("Room code collision. Please try again.");
            } else {
                alert("Connection error: " + err.type);
            }
            handleQuit();
        });
    } catch (e) {
        console.error("Failed to create peer", e);
        handleQuit();
    }
  };

  const handleJoinGame = (code: string) => {
    if (!code) return;
    setIsMultiplayer(true);
    setIsHost(false);
    setIsConnected(false);
    setGameState(GameState.JOINING);
    
    try {
        const peer = new Peer(undefined, PEER_CONFIG); 
        peerRef.current = peer;
        window.peer = peer; // Prevent GC

        peer.on('open', (id) => {
          console.log('Guest ID ready:', id);
          console.log('Connecting to:', PEER_PREFIX + code.toUpperCase());
          
          const conn = peer.connect(PEER_PREFIX + code.toUpperCase(), {
              reliable: true,
              serialization: 'json' // Force JSON to avoid browser compatibility issues
          });
          
          // Set a longer safety timeout
          const connectionTimeout = setTimeout(() => {
             if (!conn.open) {
                 console.warn('Connection timed out (15s)');
                 // Last ditch check: is ICE connected?
                 if (conn.peerConnection && (conn.peerConnection.iceConnectionState === 'connected' || conn.peerConnection.iceConnectionState === 'completed')) {
                      console.log('Timeout hit, but ICE is connected. Assuming open.');
                      // Don't quit, let the monitor handle it or user cancel
                 } else {
                      alert('Connection timed out. Host might be unreachable.');
                      handleQuit();
                 }
             }
          }, 15000);

          // Clear timeout if it opens
          conn.on('open', () => clearTimeout(connectionTimeout));
          conn.on('error', () => clearTimeout(connectionTimeout));
          conn.on('close', () => clearTimeout(connectionTimeout));

          setupConnection(conn);
        });

        peer.on('error', (err) => {
            console.error('Peer Error:', err);
            alert("Could not connect to room. Check the code or try again.");
            handleQuit();
        });
    } catch (e) {
        console.error("Failed to join peer", e);
        handleQuit();
    }
  };

  const handleQuit = useCallback(() => {
    connRef.current?.close();
    peerRef.current?.destroy();
    
    peerRef.current = null;
    connRef.current = null;
    window.peer = null;
    
    setIsMultiplayer(false);
    setIsHost(false);
    setIsConnected(false);
    setGameState(GameState.START);
    setRoomCode('');
  }, []);

  // --- Game Logic Handlers ---

  const handleStart = useCallback(() => {
    if (isMultiplayer) {
      if (isHost && connRef.current && isConnected) {
        const seed = Date.now();
        gameSeedRef.current = seed;
        // Send start command
        connRef.current.send({ type: 'START', seed });
        // Start local
        setGameState(GameState.PLAYING);
        setScore(0);
        setOpponentScore(0);
        opponentBirdRef.current.isAlive = true;
      }
    } else {
      setGameState(GameState.PLAYING);
      setScore(0);
    }
  }, [isMultiplayer, isHost, isConnected]);

  const handleGameOver = useCallback((finalScore: number) => {
    setGameState(GameState.GAME_OVER);
    
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('flappyHighScore', finalScore.toString());
    }

    if (isMultiplayer && connRef.current && isConnected) {
      try {
         connRef.current.send({ type: 'DIE', score: finalScore });
      } catch (e) {
         console.error("Failed to send DIE", e);
      }
    }
  }, [highScore, isMultiplayer, isConnected]);

  const handleScoreUpdate = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);

  // Called by GameEngine every frame to sync multiplayer data
  const handleNetworkUpdate = useCallback((y: number, rot: number, s: number) => {
    if (isMultiplayer && connRef.current && isConnected) {
       try {
          connRef.current.send({ type: 'UPDATE', y, r: rot, s });
       } catch (e) {
          // silently fail on update errors to avoid lag
       }
    }
  }, [isMultiplayer, isConnected]);

  const handleRestart = useCallback(() => {
    if (isMultiplayer) {
        // If host restarts, they re-trigger start flow
        if (isHost) {
            handleStart();
        } else {
            // Guest waits
             if (connRef.current && isConnected) {
                connRef.current.send({ type: 'RESTART' });
             }
        }
    } else {
        setGameState(GameState.START);
        setScore(0);
    }
  }, [isMultiplayer, isHost, handleStart, isConnected]);

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
                  <div className="text-center transform transition-transform duration-100">
                     <span className="text-xs font-bold text-white drop-shadow-md block bg-black/30 rounded px-2 py-0.5 mb-1">YOU</span>
                     <span className="text-6xl font-bold text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] stroke-black">
                       {score}
                     </span>
                  </div>
                  {isMultiplayer && (
                     <div className="text-center opacity-90 transform transition-transform duration-100">
                        <span className="text-xs font-bold text-red-100 drop-shadow-md block bg-red-900/30 rounded px-2 py-0.5 mb-1">P2</span>
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
            isConnected={isConnected}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
