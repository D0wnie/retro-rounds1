import {
  Enemy, EnemyType, Weapon, Pickup, PlayerState, Upgrade,
  GameState, ENEMY_STATS, MAP, MAP_W, MAP_H,
} from './types';
import { generateTextures, TextureSet, TEX_W, TEX_H } from './textures';

const SCREEN_W = 640;
const SCREEN_H = 400;
const HUD_H = 48; // Bottom HUD bar height
const VIEW_H = SCREEN_H - HUD_H;

const ENEMY_COLORS: Record<EnemyType, [number, number, number]> = {
  demon: [200, 30, 30],
  shooter: [60, 60, 180],
  tank: [40, 140, 40],
  boss: [180, 30, 180],
};

function createWeapons(): Weapon[] {
  return [
    { name: 'SHOTGUN', damage: 25, fireRate: 1.5, ammo: 50, maxAmmo: 50, spread: 0.15, projectiles: 5, color: '#ff8800' },
    { name: 'PLASMA', damage: 12, fireRate: 8, ammo: 200, maxAmmo: 200, spread: 0.02, projectiles: 1, color: '#00ccff' },
    { name: 'ROCKET', damage: 80, fireRate: 0.8, ammo: 20, maxAmmo: 20, spread: 0, projectiles: 1, color: '#ff3300' },
  ];
}

function getUpgradePool(): Upgrade[] {
  return [
    { id: 'dmg', name: '+25% DAMAGE', description: 'All weapons deal 25% more damage', icon: '⚔',
      apply: (s) => { s.damageMultiplier *= 1.25; } },
    { id: 'firerate', name: '+25% FIRE RATE', description: 'All weapons fire 25% faster', icon: '🔥',
      apply: (s) => { s.fireRateMultiplier *= 1.25; } },
    { id: 'lifesteal', name: 'LIFESTEAL', description: 'Heal 5 HP per kill', icon: '💉',
      apply: (s) => { s.lifesteal += 5; } },
    { id: 'explosive', name: 'EXPLOSIVE ROUNDS', description: 'Bullets deal AOE damage', icon: '💥',
      apply: (s) => { s.explosiveRadius += 1.5; } },
    { id: 'speed', name: 'SPEED BOOST', description: 'Move 20% faster', icon: '⚡',
      apply: (s) => { s.moveSpeed *= 1.2; } },
    { id: 'maxhp', name: '+30 MAX HP', description: 'Increase maximum health by 30', icon: '❤',
      apply: (s) => { s.maxHealth += 30; s.health = Math.min(s.health + 30, s.maxHealth); } },
    { id: 'ammoregen', name: 'AMMO REGEN', description: 'All weapons get +20 max ammo', icon: '🔋',
      apply: (s) => { s.weapons.forEach(w => { w.maxAmmo += 20; w.ammo = Math.min(w.ammo + 20, w.maxAmmo); }); } },
    { id: 'dash', name: 'DASH ABILITY', description: 'Press SHIFT to dash forward', icon: '💨',
      apply: (s) => { s.hasDash = true; s.dashCooldown = 2; } },
  ];
}

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  offscreen: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D;
  screenBuf: ImageData;
  screenPixels: Uint8ClampedArray;

  textures!: TextureSet;

  state: GameState = 'menu';
  player: PlayerState;
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  zBuffer: Float64Array = new Float64Array(SCREEN_W);

  wave: number = 0;
  waveTimer: number = 0;
  waveInterval: number = 25;
  score: number = 0;
  bestScore: number = 0;
  bestWave: number = 0;
  timeAlive: number = 0;
  killCount: number = 0;

  keys: Record<string, boolean> = {};
  mouseDown: boolean = false;
  shootCooldown: number = 0;
  weaponBob: number = 0;
  shootFlash: number = 0;
  screenShake: number = 0;
  damageFlash: number = 0;

  waveAnnounce: string = '';
  waveAnnounceTimer: number = 0;

  upgradeChoices: Upgrade[] = [];
  appliedUpgrades: string[] = [];

  onStateChange?: (state: GameState) => void;
  onStatsChange?: () => void;

  private animFrame: number = 0;
  private lastTime: number = 0;
  private running: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx.imageSmoothingEnabled = false;

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = SCREEN_W;
    this.offscreen.height = SCREEN_H;
    this.offCtx = this.offscreen.getContext('2d')!;
    this.offCtx.imageSmoothingEnabled = false;

    this.screenBuf = this.offCtx.createImageData(SCREEN_W, VIEW_H);
    this.screenPixels = this.screenBuf.data;

    this.textures = generateTextures();
    this.player = this.createPlayer();
    this.loadRecords();
    this.setupInput();
  }

  private loadRecords() {
    try {
      this.bestScore = parseInt(localStorage.getItem('doom_bestScore') || '0');
      this.bestWave = parseInt(localStorage.getItem('doom_bestWave') || '0');
    } catch { /* ignore */ }
  }

  private saveRecords() {
    try {
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem('doom_bestScore', String(this.bestScore));
      }
      if (this.wave > this.bestWave) {
        this.bestWave = this.wave;
        localStorage.setItem('doom_bestWave', String(this.bestWave));
      }
    } catch { /* ignore */ }
  }

  private createPlayer(): PlayerState {
    return {
      posX: 4, posY: 4,
      dirX: 1, dirY: 0,
      planeX: 0, planeY: 0.66,
      health: 100, maxHealth: 100,
      moveSpeed: 5.0,
      weapons: createWeapons(),
      currentWeapon: 0,
      damageMultiplier: 1,
      fireRateMultiplier: 1,
      lifesteal: 0,
      explosiveRadius: 0,
      hasDoubleJump: false,
      hasDash: false,
      dashCooldown: 2,
      lastDash: 0,
    };
  }

  private setupInput() {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      this.keys[e.code] = down;
      if (down && e.code === 'Digit1') this.player.currentWeapon = 0;
      if (down && e.code === 'Digit2') this.player.currentWeapon = 1;
      if (down && e.code === 'Digit3') this.player.currentWeapon = 2;
    };
    window.addEventListener('keydown', (e) => { e.preventDefault(); onKey(e, true); });
    window.addEventListener('keyup', (e) => onKey(e, false));

    // Mouse look
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing') return;
      if (!document.pointerLockElement) return;
      const sensitivity = 0.003;
      const dx = e.movementX * sensitivity;
      const oldDirX = this.player.dirX;
      this.player.dirX = this.player.dirX * Math.cos(dx) - this.player.dirY * Math.sin(dx);
      this.player.dirY = oldDirX * Math.sin(dx) + this.player.dirY * Math.cos(dx);
      const oldPlaneX = this.player.planeX;
      this.player.planeX = this.player.planeX * Math.cos(dx) - this.player.planeY * Math.sin(dx);
      this.player.planeY = oldPlaneX * Math.sin(dx) + this.player.planeY * Math.cos(dx);
    });

    // Mouse click = shoot
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.state === 'playing' && document.pointerLockElement) {
          this.shoot();
        }
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  startGame() {
    this.player = this.createPlayer();
    this.enemies = [];
    this.pickups = [];
    this.wave = 0;
    this.waveTimer = 0;
    this.score = 0;
    this.timeAlive = 0;
    this.killCount = 0;
    this.appliedUpgrades = [];
    this.waveAnnounce = '';
    this.waveAnnounceTimer = 0;
    this.state = 'playing';
    this.onStateChange?.('playing');
    this.spawnWave();
    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      this.loop();
    }
  }

  stop() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.state === 'playing') {
      this.update(dt);
    }
    this.render();
    this.animFrame = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.timeAlive += dt;
    this.waveTimer += dt;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.shootFlash = Math.max(0, this.shootFlash - dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 8);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 4);
    this.waveAnnounceTimer = Math.max(0, this.waveAnnounceTimer - dt);

    // Movement bobbing
    const isMoving = this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'];
    if (isMoving) {
      this.weaponBob += dt * 10;
    } else {
      // Gentle idle sway
      this.weaponBob += dt * 1.5;
    }

    // Wave timer
    if (this.waveTimer >= this.waveInterval) {
      this.waveTimer = 0;
      this.spawnWave();
    }

    this.handleMovement(dt);
    this.updateEnemies(dt);
    this.checkPickups();

    // Continuous fire with mouse held
    if (this.mouseDown && document.pointerLockElement) {
      this.shoot();
    }

    this.onStatsChange?.();
  }

  private handleMovement(dt: number) {
    const p = this.player;
    const speed = p.moveSpeed * dt;
    const margin = 0.3;

    let moveX = 0, moveY = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      moveX += p.dirX * speed;
      moveY += p.dirY * speed;
    }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      moveX -= p.dirX * speed;
      moveY -= p.dirY * speed;
    }
    if (this.keys['KeyA']) {
      moveX += p.dirY * speed;
      moveY -= p.dirX * speed;
    }
    if (this.keys['KeyD']) {
      moveX -= p.dirY * speed;
      moveY += p.dirX * speed;
    }

    // Keyboard turning with arrows
    const turnSpeed = 3.0 * dt;
    if (this.keys['ArrowLeft']) {
      const oldDirX = p.dirX;
      p.dirX = p.dirX * Math.cos(turnSpeed) - p.dirY * Math.sin(turnSpeed);
      p.dirY = oldDirX * Math.sin(turnSpeed) + p.dirY * Math.cos(turnSpeed);
      const oldPlaneX = p.planeX;
      p.planeX = p.planeX * Math.cos(turnSpeed) - p.planeY * Math.sin(turnSpeed);
      p.planeY = oldPlaneX * Math.sin(turnSpeed) + p.planeY * Math.cos(turnSpeed);
    }
    if (this.keys['ArrowRight']) {
      const oldDirX = p.dirX;
      p.dirX = p.dirX * Math.cos(-turnSpeed) - p.dirY * Math.sin(-turnSpeed);
      p.dirY = oldDirX * Math.sin(-turnSpeed) + p.dirY * Math.cos(-turnSpeed);
      const oldPlaneX = p.planeX;
      p.planeX = p.planeX * Math.cos(-turnSpeed) - p.planeY * Math.sin(-turnSpeed);
      p.planeY = oldPlaneX * Math.sin(-turnSpeed) + p.planeY * Math.cos(-turnSpeed);
    }

    // Dash
    if (p.hasDash && this.keys['ShiftLeft'] && (this.timeAlive - p.lastDash) > p.dashCooldown) {
      moveX += p.dirX * speed * 8;
      moveY += p.dirY * speed * 8;
      p.lastDash = this.timeAlive;
      this.screenShake = 0.5;
    }

    // Collision detection
    const newPX = p.posX + moveX;
    const newPY = p.posY + moveY;
    const checkX = Math.floor(newPX + Math.sign(moveX) * margin);
    const checkY = Math.floor(newPY + Math.sign(moveY) * margin);

    if (checkX >= 0 && checkX < MAP_W && MAP[Math.floor(p.posY)][checkX] === 0) {
      p.posX = newPX;
    }
    if (checkY >= 0 && checkY < MAP_H && MAP[checkY][Math.floor(p.posX)] === 0) {
      p.posY = newPY;
    }
  }

  private shoot() {
    if (this.shootCooldown > 0) return;
    const w = this.player.weapons[this.player.currentWeapon];
    if (w.ammo <= 0) return;

    w.ammo--;
    this.shootCooldown = 1 / (w.fireRate * this.player.fireRateMultiplier);
    this.shootFlash = 0.12;
    this.screenShake = w.name === 'ROCKET' ? 1.0 : w.name === 'SHOTGUN' ? 0.5 : 0.15;

    const p = this.player;
    for (let i = 0; i < w.projectiles; i++) {
      const spreadAngle = (Math.random() - 0.5) * w.spread;
      const rdx = p.dirX * Math.cos(spreadAngle) - p.dirY * Math.sin(spreadAngle);
      const rdy = p.dirX * Math.sin(spreadAngle) + p.dirY * Math.cos(spreadAngle);
      this.castBullet(rdx, rdy, w.damage * p.damageMultiplier);
    }
  }

  private castBullet(rdx: number, rdy: number, damage: number) {
    const p = this.player;
    let closestDist = Infinity;
    let closestEnemy: Enemy | null = null;

    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.posX;
      const dy = e.y - p.posY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dot = (dx * rdx + dy * rdy) / dist;
      if (dot < 0.8) continue;
      const cross = Math.abs(dx * rdy - dy * rdx);
      const hitRadius = 0.5 + (e.type === 'boss' ? 0.3 : 0);
      if (cross < hitRadius && dist < closestDist) {
        closestDist = dist;
        closestEnemy = e;
      }
    }

    if (closestEnemy) {
      this.damageEnemy(closestEnemy, damage);
      if (this.player.explosiveRadius > 0) {
        for (const e of this.enemies) {
          if (e.dead || e === closestEnemy) continue;
          const d = Math.sqrt((e.x - closestEnemy.x) ** 2 + (e.y - closestEnemy.y) ** 2);
          if (d < this.player.explosiveRadius) {
            this.damageEnemy(e, damage * 0.5);
          }
        }
      }
    }
  }

  private damageEnemy(e: Enemy, damage: number) {
    e.health -= damage;
    e.hitFlash = 0.15;
    if (e.health <= 0) {
      e.dead = true;
      this.killCount++;
      // Score based on type
      if (e.type === 'boss') this.score += 100;
      else if (e.type === 'tank') this.score += 25;
      else this.score += 10;

      if (this.player.lifesteal > 0) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.lifesteal);
      }
      if (Math.random() < 0.3) {
        const types: Pickup['type'][] = ['health', 'ammo', 'ammo'];
        this.pickups.push({
          x: e.x, y: e.y,
          type: types[Math.floor(Math.random() * types.length)],
          amount: e.type === 'boss' ? 50 : 25,
        });
      }
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);

      const dx = p.posX - e.x;
      const dy = p.posY - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const meleeRange = e.type === 'boss' ? 1.0 : 0.7;
      const isContact = dist <= meleeRange;

      if (isContact && e.type !== 'shooter') {
        e.lastAttack += dt;
        if (e.lastAttack >= e.attackCooldown) {
          e.lastAttack = 0;
          p.health -= e.damage;
          this.damageFlash = 1;
          this.screenShake = 0.5;
          if (p.health <= 0) {
            p.health = 0;
            this.gameOver();
          }
        }
      } else {
        if (e.type !== 'shooter') {
          e.lastAttack = 0;
        }
        const nx = dx / dist;
        const ny = dy / dist;
        let avoidX = 0, avoidY = 0;
        for (const other of this.enemies) {
          if (other === e || other.dead) continue;
          const ox = e.x - other.x;
          const oy = e.y - other.y;
          const od = Math.sqrt(ox * ox + oy * oy);
          if (od < 1.0 && od > 0.01) {
            avoidX += (ox / od) * 0.5;
            avoidY += (oy / od) * 0.5;
          }
        }
        const chaseFactor = 1 + Math.max(0, 4 - dist) * 0.15;
        const mx = (nx + avoidX) * e.speed * chaseFactor * dt;
        const my = (ny + avoidY) * e.speed * chaseFactor * dt;
        const newX = e.x + mx;
        const newY = e.y + my;
        if (Math.floor(newX) >= 0 && Math.floor(newX) < MAP_W && MAP[Math.floor(e.y)][Math.floor(newX)] === 0) e.x = newX;
        if (Math.floor(newY) >= 0 && Math.floor(newY) < MAP_H && MAP[Math.floor(newY)][Math.floor(e.x)] === 0) e.y = newY;
      }

      if (e.type === 'shooter') {
        if (dist >= 3 && dist <= 12) {
          e.lastAttack += dt;
          if (e.lastAttack >= e.attackCooldown) {
            e.lastAttack = 0;
            p.health -= e.damage * 0.5;
            this.damageFlash = 0.5;
            if (p.health <= 0) { p.health = 0; this.gameOver(); }
          }
        } else {
          e.lastAttack = 0;
        }
      }
    }

    this.enemies = this.enemies.filter(e => !e.dead);
    if (this.enemies.length === 0 && this.wave > 0 && this.state === 'playing') {
      this.offerUpgrades();
    }
  }

  private checkPickups() {
    const p = this.player;
    this.pickups = this.pickups.filter(pk => {
      const dx = p.posX - pk.x;
      const dy = p.posY - pk.y;
      if (dx * dx + dy * dy < 0.5) {
        if (pk.type === 'health') {
          p.health = Math.min(p.maxHealth, p.health + pk.amount);
        } else if (pk.type === 'ammo') {
          p.weapons.forEach(w => { w.ammo = Math.min(w.maxAmmo, w.ammo + Math.floor(pk.amount / 2)); });
        }
        return false;
      }
      return true;
    });
  }

  private spawnWave() {
    this.wave++;
    const baseCount = 3 + this.wave * 2;
    const types: EnemyType[] = ['demon'];
    if (this.wave >= 2) types.push('shooter');
    if (this.wave >= 4) types.push('tank');
    const hasBoss = this.wave % 5 === 0;

    // Wave announcement
    if (hasBoss) {
      this.waveAnnounce = `BOSS WAVE ${this.wave}`;
    } else {
      this.waveAnnounce = `WAVE ${this.wave}`;
    }
    this.waveAnnounceTimer = 3;

    for (let i = 0; i < baseCount; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.spawnEnemy(type);
    }
    if (hasBoss) {
      this.spawnEnemy('boss');
    }
    this.player.weapons.forEach(w => { w.ammo = Math.min(w.maxAmmo, w.ammo + Math.floor(w.maxAmmo * 0.3)); });
  }

  private spawnEnemy(type: EnemyType) {
    const stats = ENEMY_STATS[type];
    const waveScale = 1 + (this.wave - 1) * 0.15;
    let x: number, y: number, dist: number;
    do {
      x = 2 + Math.random() * (MAP_W - 4);
      y = 2 + Math.random() * (MAP_H - 4);
      dist = Math.sqrt((x - this.player.posX) ** 2 + (y - this.player.posY) ** 2);
    } while (
      Math.floor(x) < 0 || Math.floor(x) >= MAP_W ||
      Math.floor(y) < 0 || Math.floor(y) >= MAP_H ||
      MAP[Math.floor(y)][Math.floor(x)] !== 0 || dist < 5
    );

    this.enemies.push({
      x, y, type,
      health: stats.health * waveScale,
      maxHealth: stats.health * waveScale,
      speed: stats.speed * (1 + (this.wave - 1) * 0.05),
      damage: stats.damage * waveScale,
      attackCooldown: stats.attackRate,
      lastAttack: 0,
      hitFlash: 0,
      dead: false,
    });
  }

  private offerUpgrades() {
    const pool = getUpgradePool();
    const shuffled = pool.sort(() => Math.random() - 0.5);
    this.upgradeChoices = shuffled.slice(0, 3);
    this.state = 'upgrading';
    this.onStateChange?.('upgrading');
  }

  applyUpgrade(index: number) {
    const upgrade = this.upgradeChoices[index];
    if (upgrade) {
      upgrade.apply(this.player);
      this.appliedUpgrades.push(upgrade.name);
    }
    this.state = 'playing';
    this.onStateChange?.('playing');
    this.spawnWave();
  }

  private gameOver() {
    this.saveRecords();
    this.state = 'gameover';
    this.onStateChange?.('gameover');
  }

  getStats() {
    const w = this.player.weapons[this.player.currentWeapon];
    return {
      health: Math.ceil(this.player.health),
      maxHealth: this.player.maxHealth,
      ammo: w.ammo,
      maxAmmo: w.maxAmmo,
      weapon: w.name,
      wave: this.wave,
      score: this.score,
      bestScore: this.bestScore,
      bestWave: this.bestWave,
      time: Math.floor(this.timeAlive),
      kills: this.killCount,
      enemiesLeft: this.enemies.length,
    };
  }

  // ============== RENDERING ==============
  private render() {
    const ctx = this.offCtx;
    const W = SCREEN_W;
    const H = SCREEN_H;

    // Clear entire canvas to black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Screen shake offset
    const shakeX = (Math.random() - 0.5) * this.screenShake * 6;
    const shakeY = (Math.random() - 0.5) * this.screenShake * 6;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Render 3D view into pixel buffer
    this.renderFloorCeiling();
    this.renderWalls();
    // Put pixel buffer
    ctx.putImageData(this.screenBuf, 0, 0);

    // Sprites rendered with canvas drawing on top
    this.renderSprites(ctx, W, VIEW_H);

    ctx.restore();

    // Render weapon sprite
    this.renderWeapon(ctx, W, H);

    // Render crosshair
    this.renderCrosshair(ctx, W, VIEW_H);

    // Damage flash overlay
    if (this.damageFlash > 0) {
      ctx.fillStyle = `rgba(180, 0, 0, ${this.damageFlash * 0.4})`;
      ctx.fillRect(0, 0, W, VIEW_H);
    }

    // Shoot flash
    if (this.shootFlash > 0) {
      ctx.fillStyle = `rgba(255, 200, 50, ${this.shootFlash * 0.15})`;
      ctx.fillRect(0, 0, W, VIEW_H);
    }

    // Render DOOM-style HUD bar
    this.renderHUD(ctx, W, H);

    // Wave announcement
    if (this.waveAnnounceTimer > 0) {
      this.renderWaveAnnouncement(ctx, W, VIEW_H);
    }

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < VIEW_H; y += 2) {
      ctx.fillRect(0, y, W, 1);
    }

    // Copy to main canvas
    this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
  }

  private renderFloorCeiling() {
    const p = this.player;
    const pixels = this.screenPixels;
    const floorPx = this.textures.floorPixels;
    const ceilPx = this.textures.ceilingPixels;

    for (let y = VIEW_H / 2 + 1; y < VIEW_H; y++) {
      // Ray direction for leftmost and rightmost column
      const rayDirX0 = p.dirX - p.planeX;
      const rayDirY0 = p.dirY - p.planeY;
      const rayDirX1 = p.dirX + p.planeX;
      const rayDirY1 = p.dirY + p.planeY;

      const posZ = 0.5 * VIEW_H;
      const rowDist = posZ / (y - VIEW_H / 2);

      const floorStepX = rowDist * (rayDirX1 - rayDirX0) / SCREEN_W;
      const floorStepY = rowDist * (rayDirY1 - rayDirY0) / SCREEN_W;

      let floorX = p.posX + rowDist * rayDirX0;
      let floorY = p.posY + rowDist * rayDirY0;

      const fog = Math.max(0.1, 1 - rowDist / 16);

      for (let x = 0; x < SCREEN_W; x++) {
        const tx = (Math.floor(floorX * TEX_W) & (TEX_W - 1));
        const ty = (Math.floor(floorY * TEX_H) & (TEX_H - 1));
        const ti = (ty * TEX_W + tx) * 4;

        floorX += floorStepX;
        floorY += floorStepY;

        // Floor
        const fi = (y * SCREEN_W + x) * 4;
        pixels[fi] = Math.floor(floorPx[ti] * fog);
        pixels[fi + 1] = Math.floor(floorPx[ti + 1] * fog);
        pixels[fi + 2] = Math.floor(floorPx[ti + 2] * fog);
        pixels[fi + 3] = 255;

        // Ceiling (mirror)
        const ci = ((VIEW_H - 1 - y) * SCREEN_W + x) * 4;
        pixels[ci] = Math.floor(ceilPx[ti] * fog);
        pixels[ci + 1] = Math.floor(ceilPx[ti + 1] * fog);
        pixels[ci + 2] = Math.floor(ceilPx[ti + 2] * fog);
        pixels[ci + 3] = 255;
      }
    }
  }

  private renderWalls() {
    const p = this.player;
    const pixels = this.screenPixels;

    for (let x = 0; x < SCREEN_W; x++) {
      const cameraX = 2 * x / SCREEN_W - 1;
      const rayDirX = p.dirX + p.planeX * cameraX;
      const rayDirY = p.dirY + p.planeY * cameraX;

      let mapX = Math.floor(p.posX);
      let mapY = Math.floor(p.posY);

      const deltaDistX = Math.abs(1 / rayDirX);
      const deltaDistY = Math.abs(1 / rayDirY);

      let stepX: number, stepY: number;
      let sideDistX: number, sideDistY: number;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (p.posX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - p.posX) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (p.posY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - p.posY) * deltaDistY;
      }

      let hit = false;
      let side = 0;
      while (!hit) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        if (mapX < 0 || mapX >= MAP_W || mapY < 0 || mapY >= MAP_H) break;
        if (MAP[mapY][mapX] > 0) hit = true;
      }

      let perpWallDist: number;
      if (side === 0) {
        perpWallDist = (mapX - p.posX + (1 - stepX) / 2) / rayDirX;
      } else {
        perpWallDist = (mapY - p.posY + (1 - stepY) / 2) / rayDirY;
      }

      this.zBuffer[x] = perpWallDist;

      const lineHeight = Math.floor(VIEW_H / perpWallDist);
      const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + VIEW_H / 2));
      const drawEnd = Math.min(VIEW_H - 1, Math.floor(lineHeight / 2 + VIEW_H / 2));

      // Texture coordinate
      let wallX: number;
      if (side === 0) {
        wallX = p.posY + perpWallDist * rayDirY;
      } else {
        wallX = p.posX + perpWallDist * rayDirX;
      }
      wallX -= Math.floor(wallX);

      let texX = Math.floor(wallX * TEX_W);
      if (side === 0 && rayDirX > 0) texX = TEX_W - texX - 1;
      if (side === 1 && rayDirY < 0) texX = TEX_W - texX - 1;

      const wallType = MAP[mapY]?.[mapX] || 1;
      const wallPixels = this.textures.wallPixels[wallType] || this.textures.wallPixels[1];
      const shade = side === 1 ? 0.6 : 1.0;
      const fog = Math.max(0.08, 1 - perpWallDist / 16);
      const finalShade = shade * fog;

      const step = TEX_H / lineHeight;
      let texPos = (drawStart - VIEW_H / 2 + lineHeight / 2) * step;

      for (let y = drawStart; y <= drawEnd; y++) {
        const texY = Math.floor(texPos) & (TEX_H - 1);
        texPos += step;
        const ti = (texY * TEX_W + texX) * 4;
        const pi = (y * SCREEN_W + x) * 4;
        pixels[pi] = Math.floor(wallPixels[ti] * finalShade);
        pixels[pi + 1] = Math.floor(wallPixels[ti + 1] * finalShade);
        pixels[pi + 2] = Math.floor(wallPixels[ti + 2] * finalShade);
        pixels[pi + 3] = 255;
      }
    }
  }

  private renderSprites(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const p = this.player;
    const allSprites: { x: number; y: number; dist: number; color: [number, number, number]; size: number; flash: boolean; isPickup: boolean; pickupType?: string; enemyType?: EnemyType; healthPct?: number }[] = [];

    for (const e of this.enemies) {
      const dx = e.x - p.posX;
      const dy = e.y - p.posY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const baseColor = ENEMY_COLORS[e.type];
      const color: [number, number, number] = e.hitFlash > 0 ? [255, 255, 255] : [baseColor[0], baseColor[1], baseColor[2]];
      const size = e.type === 'boss' ? 1.5 : e.type === 'tank' ? 1.2 : 1.0;
      allSprites.push({ x: e.x, y: e.y, dist, color, size, flash: e.hitFlash > 0, isPickup: false, enemyType: e.type, healthPct: e.health / e.maxHealth });
    }

    for (const pk of this.pickups) {
      const dx = pk.x - p.posX;
      const dy = pk.y - p.posY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const color: [number, number, number] = pk.type === 'health' ? [0, 220, 0] : [255, 200, 0];
      allSprites.push({ x: pk.x, y: pk.y, dist, color, size: 0.4, flash: false, isPickup: true, pickupType: pk.type });
    }

    allSprites.sort((a, b) => b.dist - a.dist);

    const invDet = 1.0 / (p.planeX * p.dirY - p.dirX * p.planeY);

    for (const sprite of allSprites) {
      const sx = sprite.x - p.posX;
      const sy = sprite.y - p.posY;
      const transformX = invDet * (p.dirY * sx - p.dirX * sy);
      const transformY = invDet * (-p.planeY * sx + p.planeX * sy);

      if (transformY <= 0.1) continue;

      const spriteScreenX = Math.floor((W / 2) * (1 + transformX / transformY));
      const spriteHeight = Math.abs(Math.floor(H / transformY * sprite.size));
      const spriteWidth = Math.floor(spriteHeight * 0.7);

      const drawStartY = Math.max(0, Math.floor(-spriteHeight / 2 + H / 2));
      const drawEndY = Math.min(H - 1, Math.floor(spriteHeight / 2 + H / 2));
      const drawStartX = Math.max(0, spriteScreenX - spriteWidth / 2);
      const drawEndX = Math.min(W - 1, spriteScreenX + spriteWidth / 2);

      const fog = Math.max(0.15, 1 - sprite.dist / 16);
      const [r, g, b] = sprite.color;

      if (sprite.isPickup) {
        // Pickup: pulsing glow item
        const bob = Math.sin(this.timeAlive * 4) * 4;
        const pulse = 0.7 + Math.sin(this.timeAlive * 6) * 0.3;
        for (let stripe = Math.floor(drawStartX); stripe < drawEndX; stripe++) {
          if (transformY < this.zBuffer[stripe]) {
            ctx.fillStyle = `rgb(${Math.floor(r * fog * pulse)},${Math.floor(g * fog * pulse)},${Math.floor(b * fog * pulse)})`;
            ctx.fillRect(stripe, drawStartY + bob, 1, drawEndY - drawStartY);
          }
        }
      } else {
        // Enemy sprite: DOOM-style billboard
        for (let stripe = Math.floor(drawStartX); stripe < drawEndX; stripe++) {
          if (transformY >= this.zBuffer[stripe]) continue;

          const relX = (stripe - drawStartX) / (drawEndX - drawStartX);
          // Body shape: broader shoulders, narrower bottom
          let bodyTop = drawStartY;
          let bodyBot = drawEndY;

          // Head region (top 20%)
          const headBot = drawStartY + Math.floor(spriteHeight * 0.25);
          // Torso (20-60%)
          const torsoBot = drawStartY + Math.floor(spriteHeight * 0.6);

          // Head narrowing
          if (relX < 0.25 || relX > 0.75) {
            bodyTop = headBot; // no head at edges
          }

          // Shoulder widening
          const shoulderWidth = sprite.enemyType === 'tank' || sprite.enemyType === 'boss' ? 0.05 : 0.1;
          if (relX < shoulderWidth || relX > 1 - shoulderWidth) {
            bodyTop = Math.max(bodyTop, headBot);
          }

          // Leg narrowing at bottom
          if (relX < 0.2 || relX > 0.8) {
            bodyBot = Math.min(bodyBot, torsoBot);
          }

          // Dark body color
          const shade = 0.7 + Math.sin(relX * Math.PI) * 0.3;
          const fr = Math.floor(r * fog * shade);
          const fg = Math.floor(g * fog * shade);
          const fb = Math.floor(b * fog * shade);

          ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
          ctx.fillRect(stripe, bodyTop, 1, bodyBot - bodyTop);

          // Outline / edge darkening
          if (relX < 0.05 || relX > 0.95) {
            ctx.fillStyle = `rgb(${fr >> 1},${fg >> 1},${fb >> 1})`;
            ctx.fillRect(stripe, bodyTop, 1, bodyBot - bodyTop);
          }

          // Eyes
          if (spriteHeight > 20) {
            const eyeY = drawStartY + Math.floor(spriteHeight * 0.15);
            const eyeH = Math.max(2, Math.floor(spriteHeight / 20));
            if (relX > 0.32 && relX < 0.42) {
              ctx.fillStyle = sprite.flash ? '#ff0000' : '#ffff00';
              ctx.fillRect(stripe, eyeY, 1, eyeH);
            }
            if (relX > 0.58 && relX < 0.68) {
              ctx.fillStyle = sprite.flash ? '#ff0000' : '#ffff00';
              ctx.fillRect(stripe, eyeY, 1, eyeH);
            }
            // Mouth for demons
            if (sprite.enemyType === 'demon' || sprite.enemyType === 'boss') {
              const mouthY = drawStartY + Math.floor(spriteHeight * 0.22);
              if (relX > 0.35 && relX < 0.65 && spriteHeight > 30) {
                ctx.fillStyle = '#300';
                ctx.fillRect(stripe, mouthY, 1, Math.max(1, eyeH - 1));
              }
            }
          }

          // Health bar above enemy
          if (sprite.healthPct !== undefined && sprite.healthPct < 1) {
            const hbY = drawStartY - 4;
            const hbW = drawEndX - drawStartX;
            const hbFill = hbW * sprite.healthPct;
            if (stripe === Math.floor(drawStartX)) {
              ctx.fillStyle = '#300';
              ctx.fillRect(drawStartX, hbY, hbW, 2);
              ctx.fillStyle = '#f00';
              ctx.fillRect(drawStartX, hbY, hbFill, 2);
            }
          }
        }
      }
    }
  }

  private renderWeapon(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const w = this.player.weapons[this.player.currentWeapon];
    const isMoving = this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'];
    const bobAmplitudeX = isMoving ? 12 : 2;
    const bobAmplitudeY = isMoving ? 8 : 1;
    const bobX = Math.sin(this.weaponBob) * bobAmplitudeX;
    const bobY = Math.abs(Math.cos(this.weaponBob * 2)) * bobAmplitudeY;
    const kickBack = this.shootFlash > 0 ? 20 : 0;

    const centerX = W / 2 + bobX;
    const weaponBaseY = VIEW_H - 10 + bobY + kickBack;

    if (w.name === 'SHOTGUN') {
      this.drawShotgun(ctx, centerX, weaponBaseY);
    } else if (w.name === 'PLASMA') {
      this.drawPlasma(ctx, centerX, weaponBaseY);
    } else {
      this.drawRocket(ctx, centerX, weaponBaseY);
    }

    // Muzzle flash
    if (this.shootFlash > 0) {
      this.drawMuzzleFlash(ctx, centerX, weaponBaseY - 90, w.name);
    }
  }

  private drawShotgun(ctx: CanvasRenderingContext2D, cx: number, by: number) {
    // Barrel
    ctx.fillStyle = '#555';
    ctx.fillRect(cx - 4, by - 90, 8, 70);
    // Barrel top
    ctx.fillStyle = '#444';
    ctx.fillRect(cx - 5, by - 95, 10, 8);
    // Barrel inner
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 2, by - 95, 4, 5);
    // Pump grip
    ctx.fillStyle = '#654321';
    ctx.fillRect(cx - 8, by - 45, 16, 12);
    ctx.fillStyle = '#543210';
    ctx.fillRect(cx - 7, by - 44, 14, 10);
    // Stock/handle
    ctx.fillStyle = '#765432';
    ctx.fillRect(cx - 6, by - 30, 12, 35);
    ctx.fillStyle = '#654321';
    ctx.fillRect(cx - 5, by - 28, 10, 30);
    // Trigger guard
    ctx.fillStyle = '#444';
    ctx.fillRect(cx - 3, by - 20, 6, 8);
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - 1, by - 18, 2, 5);
    // Hand
    ctx.fillStyle = '#C4956A';
    ctx.fillRect(cx - 10, by - 35, 6, 18);
    ctx.fillRect(cx + 4, by - 35, 6, 18);
    // Highlight
    ctx.fillStyle = '#666';
    ctx.fillRect(cx - 3, by - 88, 1, 60);
  }

  private drawPlasma(ctx: CanvasRenderingContext2D, cx: number, by: number) {
    // Main body
    ctx.fillStyle = '#334';
    ctx.fillRect(cx - 10, by - 70, 20, 50);
    // Top barrel
    ctx.fillStyle = '#445';
    ctx.fillRect(cx - 6, by - 85, 12, 18);
    // Energy core
    const pulse = 0.6 + Math.sin(this.timeAlive * 10) * 0.4;
    ctx.fillStyle = `rgba(0, 200, 255, ${pulse})`;
    ctx.fillRect(cx - 4, by - 80, 8, 10);
    // Barrel tip
    ctx.fillStyle = '#556';
    ctx.fillRect(cx - 3, by - 90, 6, 8);
    // Handle
    ctx.fillStyle = '#223';
    ctx.fillRect(cx - 5, by - 20, 10, 25);
    // Hand
    ctx.fillStyle = '#C4956A';
    ctx.fillRect(cx - 12, by - 50, 6, 18);
    ctx.fillRect(cx + 6, by - 50, 6, 18);
    // Glow
    ctx.fillStyle = `rgba(0, 150, 255, ${pulse * 0.3})`;
    ctx.fillRect(cx - 14, by - 85, 28, 20);
  }

  private drawRocket(ctx: CanvasRenderingContext2D, cx: number, by: number) {
    // Launcher tube
    ctx.fillStyle = '#554433';
    ctx.fillRect(cx - 8, by - 80, 16, 60);
    // Opening
    ctx.fillStyle = '#332211';
    ctx.fillRect(cx - 6, by - 85, 12, 8);
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - 4, by - 85, 8, 5);
    // Warhead visible
    ctx.fillStyle = '#883322';
    ctx.fillRect(cx - 3, by - 83, 6, 6);
    // Grip
    ctx.fillStyle = '#443322';
    ctx.fillRect(cx - 10, by - 35, 20, 15);
    // Handle
    ctx.fillStyle = '#332211';
    ctx.fillRect(cx - 5, by - 20, 10, 25);
    // Hand
    ctx.fillStyle = '#C4956A';
    ctx.fillRect(cx - 14, by - 45, 7, 18);
    ctx.fillRect(cx + 7, by - 45, 7, 18);
    // Details
    ctx.fillStyle = '#665544';
    ctx.fillRect(cx - 7, by - 55, 2, 15);
    ctx.fillRect(cx + 5, by - 55, 2, 15);
  }

  private drawMuzzleFlash(ctx: CanvasRenderingContext2D, cx: number, cy: number, weapon: string) {
    const intensity = this.shootFlash / 0.12;
    if (weapon === 'SHOTGUN') {
      // Big orange flash
      ctx.fillStyle = `rgba(255, 150, 0, ${intensity * 0.9})`;
      ctx.fillRect(cx - 15, cy - 15, 30, 20);
      ctx.fillStyle = `rgba(255, 255, 100, ${intensity * 0.7})`;
      ctx.fillRect(cx - 8, cy - 10, 16, 12);
      ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.5})`;
      ctx.fillRect(cx - 3, cy - 5, 6, 6);
    } else if (weapon === 'PLASMA') {
      ctx.fillStyle = `rgba(0, 200, 255, ${intensity * 0.8})`;
      ctx.fillRect(cx - 10, cy - 12, 20, 16);
      ctx.fillStyle = `rgba(150, 255, 255, ${intensity * 0.6})`;
      ctx.fillRect(cx - 5, cy - 8, 10, 10);
    } else {
      ctx.fillStyle = `rgba(255, 80, 0, ${intensity * 0.9})`;
      ctx.fillRect(cx - 20, cy - 20, 40, 25);
      ctx.fillStyle = `rgba(255, 200, 50, ${intensity * 0.7})`;
      ctx.fillRect(cx - 12, cy - 12, 24, 16);
      ctx.fillStyle = `rgba(255, 255, 200, ${intensity * 0.4})`;
      ctx.fillRect(cx - 5, cy - 5, 10, 8);
    }
  }

  private renderCrosshair(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const cx = W / 2;
    const cy = H / 2;
    const gap = this.shootFlash > 0 ? 6 : 3;
    ctx.fillStyle = '#0f0';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(cx - 8, cy, 5, 1);
    ctx.fillRect(cx + gap, cy, 5, 1);
    ctx.fillRect(cx, cy - 8, 1, 5);
    ctx.fillRect(cx, cy + gap, 1, 5);
    ctx.fillRect(cx, cy, 1, 1);
    ctx.globalAlpha = 1;
  }

  private renderHUD(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const stats = this.getStats();
    const hudY = VIEW_H;

    // HUD background - dark gray DOOM-style bar
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, hudY, W, HUD_H);
    // Top border
    ctx.fillStyle = '#444';
    ctx.fillRect(0, hudY, W, 2);
    // Inset lines
    ctx.fillStyle = '#333';
    ctx.fillRect(0, hudY + 2, W, 1);

    ctx.font = 'bold 10px monospace';

    // Left section: WAVE / KILLS / SCORE
    ctx.fillStyle = '#888';
    ctx.fillText('WAVE', 8, hudY + 14);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(String(stats.wave), 8, hudY + 34);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('KILLS', 60, hudY + 14);
    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(String(stats.kills), 60, hudY + 34);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('SCORE', 115, hudY + 14);
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(String(stats.score), 115, hudY + 34);

    // Divider
    ctx.fillStyle = '#444';
    ctx.fillRect(175, hudY + 5, 1, HUD_H - 10);

    // Center: HP
    const hpX = 190;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('HEALTH', hpX, hudY + 14);
    // HP bar
    const hbW = 120, hbH = 14;
    ctx.fillStyle = '#300';
    ctx.fillRect(hpX, hudY + 18, hbW, hbH);
    const hpPct = stats.health / stats.maxHealth;
    const hpColor = hpPct > 0.5 ? '#00aa00' : hpPct > 0.25 ? '#aaaa00' : '#aa0000';
    ctx.fillStyle = hpColor;
    ctx.fillRect(hpX, hudY + 18, Math.floor(hbW * hpPct), hbH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hudY + 18, hbW, hbH);
    // HP number
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${stats.health}/${stats.maxHealth}`, hpX + 30, hudY + 30);

    // Divider
    ctx.fillStyle = '#444';
    ctx.fillRect(325, hudY + 5, 1, HUD_H - 10);

    // Center-right: AMMO + WEAPON
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('AMMO', 340, hudY + 14);
    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${stats.ammo}`, 340, hudY + 36);
    ctx.fillStyle = '#666';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`/${stats.maxAmmo}`, 385, hudY + 36);

    // Weapon name
    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(stats.weapon, 430, hudY + 14);

    // Weapon selector
    const weapons = ['1:SG', '2:PL', '3:RL'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === this.player.currentWeapon ? '#ffaa00' : '#444';
      ctx.fillText(weapons[i], 430 + i * 40, hudY + 34);
    }

    // Divider
    ctx.fillStyle = '#444';
    ctx.fillRect(555, hudY + 5, 1, HUD_H - 10);

    // Right: ENEMIES LEFT + BEST
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('LEFT', 565, hudY + 14);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(String(stats.enemiesLeft), 565, hudY + 34);

    // Best score/wave (small, top-right of HUD)
    ctx.font = '8px monospace';
    ctx.fillStyle = '#555';
    ctx.fillText(`BEST:${stats.bestScore}`, W - 75, hudY + 14);
    ctx.fillText(`WAVE:${stats.bestWave}`, W - 75, hudY + 26);
  }

  private renderWaveAnnouncement(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const alpha = Math.min(1, this.waveAnnounceTimer);
    const isBoss = this.waveAnnounce.includes('BOSS');

    ctx.save();
    ctx.globalAlpha = alpha;

    // Background bar
    ctx.fillStyle = isBoss ? 'rgba(120, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, H / 2 - 30, W, 60);
    // Borders
    ctx.fillStyle = isBoss ? '#ff2200' : '#ffaa00';
    ctx.fillRect(0, H / 2 - 30, W, 2);
    ctx.fillRect(0, H / 2 + 28, W, 2);

    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = isBoss ? '#ff2200' : '#ffaa00';
    ctx.textAlign = 'center';
    ctx.fillText(this.waveAnnounce, W / 2, H / 2 + 8);
    ctx.textAlign = 'start';

    ctx.restore();
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
  }
}
