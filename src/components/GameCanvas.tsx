import { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from '@/game/GameEngine';
import type { GameState } from '@/game/types';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [stats, setStats] = useState({
    health: 100, maxHealth: 100, ammo: 50, maxAmmo: 50, weapon: 'SHOTGUN',
    wave: 0, score: 0, bestScore: 0, bestWave: 0, time: 0, kills: 0, enemiesLeft: 0,
  });
  const [upgradeChoices, setUpgradeChoices] = useState<{ name: string; description: string; icon: string }[]>([]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    engine.onStateChange = (state) => {
      setGameState(state);
      if (state === 'upgrading') {
        setUpgradeChoices(engine.upgradeChoices.map(u => ({ name: u.name, description: u.description, icon: u.icon })));
      }
    };
    engine.onStatsChange = () => setStats(engine.getStats());

    const handleResize = () => {
      engine.resize(window.innerWidth, window.innerHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      engine.stop();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const requestPointerLock = useCallback(() => {
    canvasRef.current?.requestPointerLock();
  }, []);

  const startGame = useCallback(() => {
    engineRef.current?.startGame();
    requestPointerLock();
  }, [requestPointerLock]);

  const selectUpgrade = useCallback((index: number) => {
    engineRef.current?.applyUpgrade(index);
    requestPointerLock();
  }, [requestPointerLock]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated', cursor: gameState === 'playing' ? 'none' : 'default' }}
        onClick={() => {
          if (gameState === 'playing') requestPointerLock();
        }}
      />

      {/* MAIN MENU */}
      {gameState === 'menu' && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center"
          style={{ background: 'radial-gradient(ellipse at center, #1a0000 0%, #000 70%)' }}>
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold tracking-widest mb-2"
              style={{ color: '#cc0000', textShadow: '0 0 20px #ff0000, 0 0 40px #aa0000', fontFamily: 'monospace' }}>
              DIMENSION
            </h1>
            <h1 className="text-5xl md:text-7xl font-bold tracking-widest"
              style={{ color: '#ff2200', textShadow: '0 0 30px #ff0000, 0 0 60px #cc0000', fontFamily: 'monospace' }}>
              BREACH
            </h1>
          </div>
          <p className="text-xs mb-8 max-w-md text-center leading-relaxed px-4"
            style={{ color: '#666', fontFamily: 'monospace' }}>
            REALITY IS COLLAPSING. DEMONS LEAK THROUGH THE FRACTURES.
            <br />YOU ARE THE LAST LINE OF DEFENSE.
          </p>
          <button
            onClick={startGame}
            className="px-10 py-4 text-lg font-bold tracking-wider transition-all duration-200 hover:scale-105"
            style={{
              color: '#ff2200', border: '2px solid #aa0000', background: 'rgba(100,0,0,0.3)',
              fontFamily: 'monospace', textShadow: '0 0 10px #ff0000',
              boxShadow: '0 0 20px rgba(255,0,0,0.3), inset 0 0 20px rgba(255,0,0,0.1)',
            }}
          >
            ▶ START GAME
          </button>
          <div className="mt-8 text-center space-y-1" style={{ color: '#555', fontFamily: 'monospace', fontSize: '10px' }}>
            <p>WASD — MOVE &nbsp;&nbsp; MOUSE — AIM &nbsp;&nbsp; LEFT CLICK — SHOOT</p>
            <p>1/2/3 — WEAPONS &nbsp;&nbsp; SHIFT — DASH</p>
            <p className="mt-2" style={{ color: '#444' }}>CLICK GAME WINDOW TO LOCK MOUSE</p>
          </div>
          {stats.bestScore > 0 && (
            <div className="mt-6 text-center" style={{ color: '#666', fontFamily: 'monospace', fontSize: '10px' }}>
              <p>BEST SCORE: <span style={{ color: '#ffaa00' }}>{stats.bestScore}</span> &nbsp; BEST WAVE: <span style={{ color: '#ffaa00' }}>{stats.bestWave}</span></p>
            </div>
          )}
        </div>
      )}

      {/* UPGRADE SELECTION */}
      {gameState === 'upgrading' && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}>
          <h2 className="text-2xl font-bold mb-2"
            style={{ color: '#ffaa00', fontFamily: 'monospace', textShadow: '0 0 15px #ffaa00' }}>
            WAVE {stats.wave} CLEARED
          </h2>
          <p className="text-xs mb-8" style={{ color: '#888', fontFamily: 'monospace' }}>CHOOSE AN UPGRADE</p>
          <div className="flex gap-4 px-4">
            {upgradeChoices.map((u, i) => (
              <button
                key={i}
                onClick={() => selectUpgrade(i)}
                className="flex flex-col items-center p-6 transition-all duration-200 hover:scale-105 w-48"
                style={{
                  background: 'rgba(30,20,10,0.9)',
                  border: '2px solid #553300',
                  fontFamily: 'monospace',
                  boxShadow: '0 0 10px rgba(255,150,0,0.1)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#ffaa00')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#553300')}
              >
                <span className="text-3xl mb-3">{u.icon}</span>
                <span className="text-xs font-bold mb-2" style={{ color: '#ffaa00' }}>{u.name}</span>
                <span className="text-xs text-center" style={{ color: '#888', fontSize: '9px' }}>{u.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GAME OVER */}
      {gameState === 'gameover' && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center"
          style={{ background: 'radial-gradient(ellipse at center, #1a0000 0%, #000 70%)' }}>
          <h2 className="text-4xl font-bold mb-8"
            style={{ color: '#ff0000', fontFamily: 'monospace', textShadow: '0 0 30px #ff0000' }}>
            YOU DIED
          </h2>
          <div className="space-y-3 mb-8 text-center" style={{ fontFamily: 'monospace' }}>
            <p className="text-sm" style={{ color: '#888' }}>SCORE: <span style={{ color: '#ffff00', fontSize: '18px' }}>{stats.score}</span></p>
            <p className="text-sm" style={{ color: '#888' }}>WAVE: <span style={{ color: '#ff4444', fontSize: '18px' }}>{stats.wave}</span></p>
            <p className="text-sm" style={{ color: '#888' }}>KILLS: <span style={{ color: '#ffaa00', fontSize: '18px' }}>{stats.kills}</span></p>
            <p className="text-sm" style={{ color: '#888' }}>
              TIME: <span style={{ color: '#00ccff' }}>{Math.floor(stats.time / 60)}:{(stats.time % 60).toString().padStart(2, '0')}</span>
            </p>
            <div className="pt-4" style={{ borderTop: '1px solid #333' }}>
              <p className="text-xs" style={{ color: '#555' }}>BEST SCORE: <span style={{ color: '#ffaa00' }}>{stats.bestScore}</span></p>
              <p className="text-xs" style={{ color: '#555' }}>BEST WAVE: <span style={{ color: '#ffaa00' }}>{stats.bestWave}</span></p>
            </div>
          </div>
          <button
            onClick={startGame}
            className="px-10 py-4 text-lg font-bold tracking-wider transition-all duration-200 hover:scale-105"
            style={{
              color: '#ff2200', border: '2px solid #aa0000', background: 'rgba(100,0,0,0.3)',
              fontFamily: 'monospace', textShadow: '0 0 10px #ff0000',
            }}
          >
            ▶ TRY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
