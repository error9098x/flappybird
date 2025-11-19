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
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
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
  const [countdown, setCountdown] = useState(3);

  // Multiplayer State
  const [roomCode, setRoomCode] = useState<string>('');
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [opponentScore, setOpponentScore] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  
  // Debug Logging
  const [statusLog, setStatusLog] = useState<string[]>([]);
  
  // Refs for networking to avoid re-renders
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const opponentBirdRef = useRef<OpponentBird>({ y: 300, velocity: 0, rotation: 0, isAlive: true, score: 0 });
  const gameSeedRef = useRef<number>(Date.now());

  const addLog = useCallback((msg: string) => {
      console.log(`[App] ${msg}`);
      setStatusLog(prev => {
          const newLogs = [...prev, msg];
          if (newLogs.length > 6) return newLogs.slice(newLogs.length - 6);
          return newLogs;
      });
  }, []);

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

  // Countdown Timer
  useEffect(() => {
    if (gameState === GameState.COUNTDOWN) {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setGameState(GameState.PLAYING);
      }
    }
  }, [gameState, countdown]);

  // --- Network Handlers ---
  
  const setupConnection = (conn: DataConnection) => {
    connRef.current = conn;
    addLog(`Setup conn: ${conn.peer.substring(0,5)}...`);
    
    const handleOpen = () => {
      addLog('State: Connection OPENED');
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
    // Monitor the low-level ICE state and raw DataChannel state.
    const monitorInterval = setInterval(() => {
        if (!conn.peerConnection) return;
        
        const iceState = conn.peerConnection.iceConnectionState;
        const dcState = conn.dataChannel?.readyState;
        
        // Only log interesting state changes or if we are waiting
        if (iceState !== 'connected' || !isConnected) {
             // addLog(`ICE: ${iceState} | DC: ${dcState}`);
        }
        
        if (iceState === 'connected' || iceState === 'completed') {
            // The network path is open.
            
            // Check if PeerJS thinks it's open
            if (conn.open) {
                if (!isConnected) handleOpen();
            } 
            // Fallback: Check the raw WebRTC DataChannel state
            // This fixes issues where PeerJS state lags behind the actual channel
            else if (dcState === 'open') {
                addLog('Raw DC OPEN. Forcing state.');
                handleOpen();
            }
        }
        
        if (iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed') {
            addLog('Connection died (ICE failed)');
            clearInterval(monitorInterval);
            setIsConnected(false);
            if (gameState !== GameState.START && gameState !== GameState.LOBBY) {
                 alert('Connection lost');
                 handleQuit();
            }
        }
    }, 800);

    conn.on('close', () => {
        addLog('Conn closed event');
        clearInterval(monitorInterval);
    });
    conn.on('error', (err) => {
        addLog(`Conn error: ${err.type}`);
        clearInterval(monitorInterval);
    });

    // CRITICAL FIX: Check if connection is ALREADY open (Race Condition Fix)
    if (conn.open) {
      addLog('Conn already OPEN');
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (data: unknown) => {
      const msg = data as NetMessage;
      
      if (msg.type === 'START') {
        addLog('RX: START');
        gameSeedRef.current = msg.seed;
        // Start Countdown on Guest side
        setCountdown(3);
        setGameState(GameState.COUNTDOWN);
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
        
        // If we are currently spectating (meaning we died first), now both are dead
        // So we can show the Game Over screen
        setGameState(current => {
             if (current === GameState.SPECTATING) {
                 return GameState.GAME_OVER;
             }
             return current;
        });
      }
      else if (msg.type === 'RESTART') {
        // Signal received, waiting for host logic or handled automatically
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
    setStatusLog(['Initializing Host...']);

    try {
        // Pass config with STUN servers
        const peer = new Peer(PEER_PREFIX + code, PEER_CONFIG);
        peerRef.current = peer;
        window.peer = peer; // Prevent GC

        peer.on('open', (id) => {
          addLog(`Host ID: ${id}`);
        });

        peer.on('connection', (conn) => {
          addLog('Guest connecting...');
          // The guest initiates connection with serialization: 'json', so we don't need to set it here.
          // Moreover, it is readonly on the incoming connection object.
          setupConnection(conn);
        });
        
        peer.on('error', (err) => {
            addLog(`Error: ${err.type}`);
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
    setStatusLog(['Initializing Guest...']);
    
    try {
        const peer = new Peer(undefined, PEER_CONFIG); 
        peerRef.current = peer;
        window.peer = peer; // Prevent GC

        peer.on('open', (id) => {
          addLog(`My ID: ${id}`);
          addLog(`Connecting to: ${code}`);
          
          const conn = peer.connect(PEER_PREFIX + code.toUpperCase(), {
              reliable: true,
              serialization: 'json' // Force JSON to avoid browser compatibility issues
          });
          
          // Set a longer safety timeout
          const connectionTimeout = setTimeout(() => {
             if (!conn.open) {
                 addLog('Timeout (15s)');
                 // Last ditch check: is ICE connected?
                 if (conn.peerConnection && (conn.peerConnection.iceConnectionState === 'connected' || conn.peerConnection.iceConnectionState === 'completed')) {
                      addLog('Timeout but ICE connected. Forcing open.');
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
            addLog(`Error: ${err.type}`);
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
    setStatusLog([]);
  }, []);

  // --- Game Logic Handlers ---

  const handleStart = useCallback(() => {
    if (isMultiplayer) {
      if (isHost && connRef.current && isConnected) {
        const seed = Date.now();
        gameSeedRef.current = seed;
        // Send start command
        connRef.current.send({ type: 'START', seed });
        
        // Start local Countdown
        setCountdown(3);
        setGameState(GameState.COUNTDOWN);
        setScore(0);
        setOpponentScore(0);
        opponentBirdRef.current.isAlive = true;
      }
    } else {
      // Single player countdown
      setCountdown(3);
      setGameState(GameState.COUNTDOWN);
      setScore(0);
    }
  }, [isMultiplayer, isHost, isConnected]);

  const handleGameOver = useCallback((finalScore: number) => {
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('flappyHighScore', finalScore.toString());
    }

    // Multiplayer Death Logic
    if (isMultiplayer && connRef.current && isConnected) {
      try {
         connRef.current.send({ type: 'DIE', score: finalScore });
      } catch (e) {
         console.error("Failed to send DIE", e);
      }

      // If opponent is still alive, we spectate
      if (opponentBirdRef.current.isAlive) {
          setGameState(GameState.SPECTATING);
      } else {
          // Both dead
          setGameState(GameState.GAME_OVER);
      }
    } else {
      // Single Player
      setGameState(GameState.GAME_OVER);
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
        setCountdown(3);
        setGameState(GameState.COUNTDOWN);
        setScore(0);
    }
  }, [isMultiplayer, isHost, handleStart, isConnected]);

  return (
    <div className="relative w-full h-screen bg-slate-900 flex justify-center items-center overflow-hidden">
      <div className="relative w-full max-w-md h-full max-h-[800px] shadow-2xl bg-sky-300 overflow-hidden md:rounded-xl border-4 border-slate-800">
        
        <GameEngine 
          gameState={gameState}
          countdown={countdown}
          onGameOver={handleGameOver}
          onScoreUpdate={handleScoreUpdate}
          isMultiplayer={isMultiplayer}
          gameSeed={gameSeedRef.current}
          opponentBirdRef={opponentBirdRef}
          onNetworkUpdate={handleNetworkUpdate}
        />

        {/* UI Layer */}
        <div className="absolute inset-0 pointer-events-none">
          {(gameState === GameState.PLAYING || gameState === GameState.SPECTATING) && (
            <div className="absolute top-10 w-full flex flex-col items-center pointer-events-none z-10">
               <div className="flex gap-8">
                  <div className={`text-center transform transition-all duration-300 ${gameState === GameState.SPECTATING ? 'opacity-50 scale-75' : 'scale-100'}`}>
                     <span className="text-xs font-bold text-white drop-shadow-md block bg-black/30 rounded px-2 py-0.5 mb-1">YOU</span>
                     <span className="text-6xl font-bold text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] stroke-black">
                       {score}
                     </span>
                  </div>
                  {isMultiplayer && (
                     <div className={`text-center transform transition-all duration-300 ${gameState === GameState.SPECTATING ? 'opacity-100 scale-110' : 'opacity-90 scale-100'}`}>
                        <span className="text-xs font-bold text-red-100 drop-shadow-md block bg-red-900/30 rounded px-2 py-0.5 mb-1">P2</span>
                        <span className="text-6xl font-bold text-red-100 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] stroke-black">
                          {opponentScore}
                        </span>
                     </div>
                  )}
               </div>
               {gameState === GameState.SPECTATING && (
                   <div className="mt-2 bg-red-500/80 text-white font-bold px-4 py-1 rounded-full animate-pulse shadow-lg">
                       SPECTATING OPPONENT
                   </div>
               )}
            </div>
          )}

          <Overlay 
            gameState={gameState}
            score={score}
            highScore={highScore}
            countdown={countdown}
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
            statusLog={statusLog}
          />
        </div>
      </div>
    </div>
  );
};

export default App;