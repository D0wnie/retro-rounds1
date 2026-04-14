import { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from '@/game/GameEngine';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const isMobile = useIsMobile();
  const joystickRef = useRef<{ id: number; centerX: number; centerY: number } | null>(null);
  const aimRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);
  const [joystickPosition, setJoystickPosition] = useState({ x: 0, y: 0 });

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

  const updateJoystick = useCallback((x: number, y: number) => {
    engineRef.current?.setMobileMovement(x, y);
    setJoystickPosition({ x, y });
  }, []);

  const endJoystick = useCallback(() => {
    updateJoystick(0, 0);
    joystickRef.current = null;
  }, [updateJoystick]);

  const handleJoystickTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    joystickRef.current = { id: touch.identifier, centerX, centerY };
    const dx = (touch.clientX - centerX) / (rect.width / 2);
    const dy = (centerY - touch.clientY) / (rect.height / 2);
    updateJoystick(Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy)));
  }, [updateJoystick]);

  const handleJoystickTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!joystickRef.current) return;
    const touch = Array.from(event.changedTouches).find(t => t.identifier === joystickRef.current?.id);
    if (!touch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (touch.clientX - joystickRef.current.centerX) / (rect.width / 2);
    const dy = (joystickRef.current.centerY - touch.clientY) / (rect.height / 2);
    updateJoystick(Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy)));
  }, [updateJoystick]);

  const handleAimTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    aimRef.current = { id: touch.identifier, lastX: touch.clientX, lastY: touch.clientY };
  }, []);

  const handleAimTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!aimRef.current) return;
    const touch = Array.from(event.changedTouches).find(t => t.identifier === aimRef.current?.id);
    if (!touch) return;
    const dx = touch.clientX - aimRef.current.lastX;
    aimRef.current.lastX = touch.clientX;
    aimRef.current.lastY = touch.clientY;
    engineRef.current?.setMobileAim(dx);
  }, []);

  const handleAimTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!aimRef.current) return;
    const touch = Array.from(event.changedTouches).find(t => t.identifier === aimRef.current?.id);
    if (touch) aimRef.current = null;
  }, []);

  const handleMobileShootStart = useCallback((event: React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    engineRef.current?.setMobileShooting(true);
  }, []);

  const handleMobileShootEnd = useCallback(() => {
    engineRef.current?.setMobileShooting(false);
  }, []);

  const handleMobileJump = useCallback((event: React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    engineRef.current?.activateJump();
  }, []);

  const requestPointerLock = useCallback(() => {
    canvasRef.current?.requestPointerLock();
  }, []);

  const startGame = useCallback(() => {
    engineRef.current?.startGame();
    if (!isMobile) requestPointerLock();
  }, [isMobile, requestPointerLock]);

  const selectUpgrade = useCallback((index: number) => {
    engineRef.current?.applyUpgrade(index);
    if (!isMobile) requestPointerLock();
  }, [isMobile, requestPointerLock]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated', cursor: gameState === 'playing' && !isMobile ? 'none' : 'default' }}
        onClick={() => {
          if (gameState === 'playing' && !isMobile) requestPointerLock();
        }}
      />

      {isMobile && gameState === 'playing' && (
        <>
          <div
            className="absolute left-4 bottom-28 z-20 w-36 h-36 rounded-full bg-black/40 border border-white/10"
            style={{ touchAction: 'none' }}
            onTouchStart={handleJoystickTouchStart}
            onTouchMove={handleJoystickTouchMove}
            onTouchEnd={endJoystick}
            onTouchCancel={endJoystick}
          >
            <div className="absolute inset-0 rounded-full border border-white/20" />
            <div
              className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/25"
              style={{ transform: `translate(calc(-50% + ${joystickPosition.x * 18}px), calc(-50% + ${joystickPosition.y * 18}px))` }}
            />
          </div>

          <div
            className="absolute top-0 right-0 h-full w-1/2 z-10"
            style={{ touchAction: 'none' }}
            onTouchStart={handleAimTouchStart}
            onTouchMove={handleAimTouchMove}
            onTouchEnd={handleAimTouchEnd}
            onTouchCancel={handleAimTouchEnd}
          />

          <button
            className="absolute right-4 bottom-32 z-20 rounded-full bg-red-600/80 px-5 py-3 text-sm font-bold text-white shadow-lg"
            onTouchStart={handleMobileShootStart}
            onTouchEnd={handleMobileShootEnd}
            onTouchCancel={handleMobileShootEnd}
            style={{ touchAction: 'none' }}
          >
            SHOOT
          </button>

          <button
            className="absolute right-4 bottom-12 z-20 rounded-full bg-slate-800/90 px-4 py-3 text-sm font-bold text-white shadow-lg"
            onTouchStart={handleMobileJump}
            style={{ touchAction: 'none' }}
          >
            JUMP
          </button>

          <div className="absolute left-4 bottom-4 z-20 text-xs text-white/80 font-mono">
            TOUCH LEFT — MOVE · SWIPE RIGHT — AIM · USE BUTTONS TO FIRE / JUMP
          </div>
        </>
      )}

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
          {isMobile ? (
            <div className="mt-8 text-center space-y-1" style={{ color: '#555', fontFamily: 'monospace', fontSize: '10px' }}>
              <p>TOUCH LEFT JOYSTICK — MOVE</p>
              <p>SWIPE RIGHT PANEL — AIM</p>
              <p>SHOOT BUTTON — FIRE</p>
              <p className="mt-2" style={{ color: '#444' }}>TAP START TO BEGIN</p>
            </div>
          ) : (
            <div className="mt-8 text-center space-y-1" style={{ color: '#555', fontFamily: 'monospace', fontSize: '10px' }}>
              <p>WASD — MOVE &nbsp;&nbsp; MOUSE — AIM &nbsp;&nbsp; LEFT CLICK — SHOOT</p>
              <p>1/2/3 — WEAPONS &nbsp;&nbsp; SHIFT — DASH</p>
              <p className="mt-2" style={{ color: '#444' }}>CLICK GAME WINDOW TO LOCK MOUSE</p>
            </div>
          )}
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
