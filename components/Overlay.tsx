
import React, { useState } from 'react';
import { GameState } from '../types';
import { Button } from './Button';

interface OverlayProps {
  gameState: GameState;
  score: number;
  highScore: number;
  onStart: () => void;
  onRestart: () => void;
  
  // Multiplayer Props
  isMultiplayer: boolean;
  isHost: boolean;
  roomCode?: string;
  opponentScore?: number;
  isConnected?: boolean;
  onCreateGame?: () => void;
  onJoinGame?: (code: string) => void;
  onQuit?: () => void;
  statusLog?: string[];
}

export const Overlay: React.FC<OverlayProps> = ({
  gameState,
  score,
  highScore,
  onStart,
  onRestart,
  isMultiplayer,
  isHost,
  roomCode,
  opponentScore = 0,
  isConnected,
  onCreateGame,
  onJoinGame,
  onQuit,
  statusLog
}) => {
  const [joinCode, setJoinCode] = useState('');

  if (gameState === GameState.PLAYING) return null;

  const renderDebugLog = () => (
     statusLog && statusLog.length > 0 && (
        <div className="mt-4 w-full max-w-xs bg-black/80 rounded p-2 pointer-events-auto">
            <div className="text-[10px] font-mono text-green-400 h-16 overflow-y-auto flex flex-col-reverse">
                {statusLog.slice().reverse().map((log, i) => (
                    <div key={i} className="truncate">
                       <span className="opacity-50">[{i}]</span> {log}
                    </div>
                ))}
            </div>
        </div>
     )
  );

  const renderStartScreen = () => (
    <div className="flex flex-col items-center animate-bounce-slow w-full px-4 pointer-events-auto">
        <div className="mb-6 text-center">
            <h1 className="text-6xl font-black text-yellow-400 tracking-wider drop-shadow-[0_4px_0_#000] stroke-black title-font select-none">
                FLAPPY
            </h1>
            <h1 className="text-6xl font-black text-white tracking-wider drop-shadow-[0_4px_0_#000] stroke-black title-font select-none">
                FLIGHT
            </h1>
        </div>
        
        {gameState === GameState.START && (
            <div className="flex flex-col gap-4 w-full max-w-xs">
                 <Button onClick={onStart} label="SOLO PLAY" primary />
                 {/* Divider */}
                 <div className="flex items-center gap-2 opacity-50 select-none">
                    <div className="h-1 flex-1 bg-white rounded"></div>
                    <span className="text-white font-bold">OR</span>
                    <div className="h-1 flex-1 bg-white rounded"></div>
                 </div>
                 <Button onClick={onCreateGame!} label="CREATE ROOM" primary={false} />
                 
                 <div className="flex gap-2">
                    <input 
                        type="text" 
                        maxLength={5}
                        placeholder="CODE"
                        className="bg-white rounded-full px-4 py-3 font-black text-slate-800 text-center uppercase w-28 shadow-[0_4px_0_rgba(0,0,0,0.2)] outline-none focus:ring-2 focus:ring-sky-400 pointer-events-auto"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    />
                    <div className="flex-1">
                        <Button 
                            onClick={() => joinCode.length >= 4 && onJoinGame && onJoinGame(joinCode)} 
                            label="JOIN" 
                            primary={false} 
                        />
                    </div>
                 </div>
            </div>
        )}
        
        {gameState === GameState.WAITING && isHost && (
            <div className="bg-white/90 p-8 rounded-2xl shadow-xl border-4 border-slate-800 flex flex-col items-center pointer-events-auto transition-all">
                <h3 className="text-slate-800 font-bold text-xl mb-2 select-none">ROOM CODE</h3>
                <div className="bg-slate-200 px-6 py-3 rounded-lg mb-4 cursor-text select-all border-2 border-slate-300 border-dashed">
                    <span className="text-4xl font-black text-slate-800 tracking-widest select-text">{roomCode}</span>
                </div>
                
                {!isConnected && (
                  <div className="flex flex-col items-center mb-6">
                      <div className="animate-spin w-6 h-6 border-4 border-sky-500 border-t-transparent rounded-full mb-2"></div>
                      <p className="text-slate-500 animate-pulse text-center select-none text-sm font-bold">
                          Waiting for opponent...
                      </p>
                  </div>
                )}

                {isConnected && (
                   <div className="mb-6 flex flex-col items-center">
                      <div className="bg-green-100 text-green-700 px-4 py-2 rounded-full font-bold text-sm mb-4 border-2 border-green-200 animate-bounce">
                         PLAYER CONNECTED!
                      </div>
                      <Button onClick={onStart} label="START GAME" primary />
                   </div>
                )}
                
                {!isConnected && (
                    <button onClick={onQuit} className="text-red-500 font-bold hover:underline pointer-events-auto px-4 py-2 hover:bg-red-50 rounded">
                        Cancel
                    </button>
                )}
                {isConnected && (
                     <button onClick={onQuit} className="mt-4 text-slate-400 hover:text-red-500 text-xs font-bold pointer-events-auto">
                        Cancel Room
                    </button>
                )}
                {renderDebugLog()}
            </div>
        )}
        
        {gameState === GameState.JOINING && (
            <div className="bg-white/90 p-8 rounded-2xl shadow-xl border-4 border-slate-800 flex flex-col items-center pointer-events-auto">
                <div className="animate-spin w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full mb-4"></div>
                <h3 className="text-slate-800 font-bold text-xl select-none">CONNECTING...</h3>
                <p className="text-slate-500 text-xs mt-2 mb-4">Establishing P2P Link</p>
                <button onClick={onQuit} className="text-red-500 font-bold hover:underline pointer-events-auto px-4 py-2 hover:bg-red-50 rounded">
                    Cancel
                </button>
                {renderDebugLog()}
            </div>
        )}
        
        {gameState === GameState.WAITING && !isHost && (
            <div className="bg-white/90 p-8 rounded-2xl shadow-xl border-4 border-slate-800 flex flex-col items-center pointer-events-auto">
                <h3 className="text-green-600 font-bold text-xl mb-2 select-none">CONNECTED!</h3>
                <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-100 mb-4">
                    <p className="text-slate-600 text-center select-none text-sm font-semibold">Waiting for host to start...</p>
                </div>
                <div className="flex gap-2 mb-6">
                    <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce delay-0"></div>
                    <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce delay-200"></div>
                </div>
                <button onClick={onQuit} className="text-red-500 font-bold hover:underline pointer-events-auto px-4 py-2 hover:bg-red-50 rounded">
                    Leave Room
                </button>
                {renderDebugLog()}
            </div>
        )}
    </div>
  );

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/40 backdrop-blur-sm transition-all duration-300 pointer-events-auto">
      {(gameState === GameState.START || gameState === GameState.WAITING || gameState === GameState.JOINING) && renderStartScreen()}

      {gameState === GameState.GAME_OVER && (
        <div className="flex flex-col items-center animate-pop-in pointer-events-auto">
           <div className="mb-6 text-center transform -rotate-2">
                <h2 className="text-6xl font-black text-red-500 tracking-wide drop-shadow-[0_4px_0_#000] select-none">
                    GAME
                </h2>
                <h2 className="text-6xl font-black text-red-500 tracking-wide drop-shadow-[0_4px_0_#000] select-none">
                    OVER
                </h2>
           </div>

           <div className="bg-[#ded895] border-4 border-[#553000] p-6 rounded-lg shadow-2xl w-72 mb-6 relative">
                <div className="flex justify-between items-end border-b-2 border-[#b8ae56] pb-2 mb-2">
                    <span className="text-[#e86101] font-bold text-sm tracking-widest select-none">YOUR SCORE</span>
                    <span className="text-3xl font-black text-slate-800">{score}</span>
                </div>
                
                {!isMultiplayer && (
                     <div className="flex justify-between items-end pt-2">
                        <span className="text-[#e86101] font-bold text-sm tracking-widest select-none">BEST</span>
                        <span className="text-3xl font-black text-slate-800">{highScore}</span>
                    </div>
                )}

                {isMultiplayer && (
                    <div className="flex justify-between items-end pt-2 border-t-2 border-[#b8ae56] mt-2">
                        <span className="text-red-600 font-bold text-sm tracking-widest select-none">OPPONENT</span>
                        <span className="text-3xl font-black text-slate-800">{opponentScore}</span>
                    </div>
                )}
                
                {!isMultiplayer && score >= highScore && score > 0 && (
                    <div className="absolute -top-4 -right-4 bg-yellow-400 text-xs font-bold px-2 py-1 rounded-full border-2 border-black transform rotate-12 shadow-md animate-pulse select-none">
                        NEW HIGH!
                    </div>
                )}

                {isMultiplayer && (
                    <div className={`absolute -bottom-4 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full border-2 border-black shadow-md font-black text-sm whitespace-nowrap ${score > opponentScore ? 'bg-green-400 text-green-900' : score < opponentScore ? 'bg-red-400 text-red-900' : 'bg-gray-200'} select-none`}>
                        {score > opponentScore ? 'YOU WON!' : score < opponentScore ? 'YOU LOST!' : 'TIED!'}
                    </div>
                )}
           </div>

           <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button onClick={onRestart} label={isMultiplayer && !isHost ? "WAITING FOR HOST..." : "PLAY AGAIN"} primary={!(isMultiplayer && !isHost)} />
                {isMultiplayer && (
                    <button onClick={onQuit} className="mt-2 text-white font-bold hover:underline drop-shadow-md pointer-events-auto">
                        Quit to Menu
                    </button>
                )}
           </div>
        </div>
      )}
    </div>
  );
};
