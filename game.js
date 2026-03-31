// ============================================================
// 雷霆裂空 - Thunder Force  |  game.js  v2
// ============================================================

const W = 540, H = 960;

// ---------- 美术资源管理 ----------
const IMGS = {};
const imgSrcs = {
    player: 'player.png', enemy: 'enemy.png',
    bg: 'bg.png', bullet: 'bullet.png', explosion: 'explosion.png'
};
for (const [key, src] of Object.entries(imgSrcs)) {
    const img = new Image();
    img.onload = () => { img._ready = true; };
    img.onerror = () => { img._ready = false; };
    img.src = src;
    IMGS[key] = img;
}
function hasAsset(key) {
    const img = IMGS[key];
    return img && img._ready && img.naturalWidth > 0;
}

// ---------- canvas ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;

// ---------- 输入 ----------
const keys = {};
let firingEnabled = true;
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === 'Escape') togglePause();
    if (e.key === 'f' || e.key === 'F') firingEnabled = !firingEnabled;
    if (!['F5','F11','F12'].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

let touchX = null, touchY = null;
canvas.addEventListener('touchstart', e => {
    const t = e.touches[0]; touchX = t.clientX; touchY = t.clientY;
}, { passive: true });
canvas.addEventListener('touchmove', e => {
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    player.x = (t.clientX - rect.left) * (W / rect.width) - player.w / 2;
    player.y = (t.clientY - rect.top) * (H / rect.height) - player.h / 2;
    player.x = Math.max(0, Math.min(W - player.w, player.x));
    player.y = Math.max(0, Math.min(H - player.h, player.y));
    e.preventDefault();
}, { passive: false });

// ---------- 游戏状态 ----------
let gameState = 'start'; // 'start' | 'playing' | 'paused' | 'gameover'
let score = 0, wave = 0;
let radarPressure = 0, isRadarBurst = false, radarBurstEnd = 0;
let frameCount = 0;
let screenShake = 0; // 受击震动帧数

// ---------- 爆炸粒子 ----------
const explosions = [];
function spawnExplosion(x, y, count = 12, color = '#00ffff', sizeScale = 1) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        explosions.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30 + Math.random() * 20 | 0,
            maxLife: 50,
            r: (2 + Math.random() * 3) * sizeScale,
            color
        });
    }
}
function updateDrawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const p = explosions[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
        if (p.life <= 0) { explosions.splice(i, 1); continue; }
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (hasAsset('explosion')) {
            const size = p.r * 6 * (1 - alpha * 0.3);
            ctx.shadowColor = p.color; ctx.shadowBlur = 10;
            ctx.drawImage(IMGS.explosion, p.x - size/2, p.y - size/2, size, size);
        } else {
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color; ctx.shadowBlur = 6;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
}

// ---------- 命中闪光 ----------
const hitFlashes = [];
function spawnHitFlash(x, y, color = '#ffffff') {
    hitFlashes.push({ x, y, color, life: 8, maxLife: 8 });
}
function updateDrawHitFlashes() {
    for (let i = hitFlashes.length - 1; i >= 0; i--) {
        const f = hitFlashes[i];
        f.life--;
        if (f.life <= 0) { hitFlashes.splice(i, 1); continue; }
        const alpha = f.life / f.maxLife;
        const r = (1 - alpha) * 20 + 4;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}

// ---------- 玩家 ----------
const player = {
    x: W/2 - 40, y: H - 120,
    w: 80, h: 80,
    hp: 100, maxHp: 100,
    speed: 5,
    invincible: 0,
    fireCd: 0, fireRate: 16,

    update() {
        if (keys['ArrowLeft'] || keys['a']) this.x -= this.speed;
        if (keys['ArrowRight'] || keys['d']) this.x += this.speed;
        if (keys['ArrowUp'] || keys['w']) this.y -= this.speed;
        if (keys['ArrowDown'] || keys['s']) this.y += this.speed;
        this.x = Math.max(0, Math.min(W - this.w, this.x));
        this.y = Math.max(0, Math.min(H - this.h, this.y));
        if (this.invincible > 0) this.invincible--;
        this.fireCd++;
        if (firingEnabled && this.fireCd >= this.fireRate) {
            this.fireCd = 0;
            spawnPlayerBullet();
        }
    },

    draw() {
        const cx = this.x + this.w/2, cy = this.y + this.h/2;
        ctx.save();
        if (isRadarBurst) { ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 25; }
        else { ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 15; }
        if (this.invincible > 0 && Math.floor(this.invincible/4) % 2 === 0) ctx.globalAlpha = 0.35;

        if (hasAsset('player')) {
            ctx.drawImage(IMGS.player, this.x, this.y, this.w, this.h);
        } else {
            ctx.fillStyle = isRadarBurst ? '#ffff00' : '#00e5ff';
            ctx.beginPath();
            ctx.moveTo(cx, this.y);
            ctx.lineTo(this.x + this.w, this.y + this.h);
            ctx.lineTo(cx, this.y + this.h * 0.65);
            ctx.lineTo(this.x, this.y + this.h);
            ctx.closePath(); ctx.fill();
            // 引擎火焰
            ctx.fillStyle = isRadarBurst ? 'rgba(255,200,0,0.8)' : 'rgba(0,200,255,0.6)';
            ctx.beginPath();
            ctx.ellipse(cx, this.y + this.h + 8, 8, 14 + Math.random()*6, 0, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();

        // 血条
        ctx.fillStyle = '#222';
        ctx.fillRect(this.x, this.y + this.h + 4, this.w, 4);
        ctx.fillStyle = this.hp > 50 ? '#00ff88' : this.hp > 25 ? '#ffaa00' : '#ff3333';
        ctx.fillRect(this.x, this.y + this.h + 4, this.w * (this.hp/this.maxHp), 4);
    },

    hit(dmg) {
        if (this.invincible > 0 || isRadarBurst) return;
        this.hp -= dmg;
        this.invincible = 50;
        screenShake = 10;
        spawnExplosion(this.x + this.w/2, this.y + this.h/2, 10, '#ff4444');
        if (this.hp <= 0) { this.hp = 0; gameState = 'gameover'; }
    }
};

// ---------- 子弹 ----------
const playerBullets = [], enemyBullets = [];

function spawnPlayerBullet() {
    const cx = player.x + player.w/2;
    const offsets = isRadarBurst ? [-18, -6, 6, 18] : [-8, 8];
    for (const offset of offsets) {
        playerBullets.push({ x: cx + offset, y: player.y + 10, vx: 0, vy: -12, r: 5 });
    }
}

function drawPlayerBullets() {
    ctx.save();
    for (const b of playerBullets) {
        const { x, y, r } = b;
        const color = isRadarBurst ? '#ffff00' : '#00ffff';
        // 光晕
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r*5);
        glow.addColorStop(0, isRadarBurst ? 'rgba(255,255,0,0.5)' : 'rgba(0,255,255,0.5)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.ellipse(x, y+r*2, r*4, r*7, 0, 0, Math.PI*2); ctx.fill();
        // 主体
        const bodyGrad = ctx.createLinearGradient(x, y-r*2.5, x, y+r*2.5);
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.3, color);
        bodyGrad.addColorStop(1, 'rgba(0,100,255,0)');
        ctx.shadowColor = color; ctx.shadowBlur = 15;
        ctx.fillStyle = bodyGrad;
        ctx.beginPath(); ctx.ellipse(x, y, r*0.7, r*2.5, 0, 0, Math.PI*2); ctx.fill();
        // 核心
        ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(x, y-r*0.5, r*0.3, r*0.8, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
}

function drawEnemyBullets() {
    ctx.save();
    for (const b of enemyBullets) {
        ctx.shadowColor = b.color || '#ff3333';
        ctx.shadowBlur = 8;
        ctx.fillStyle = b.color || '#ff5555';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
}

// ---------- 普通敌机 ----------
const enemies = [];
class Enemy {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.w = type === 'elite' ? 72 : 56;
        this.h = type === 'elite' ? 72 : 56;
        this.hp = type === 'elite' ? 5 : 2;
        this.maxHp = this.hp;
        this.fireCd = Math.random() * 60 | 0;
        this.fireRate = type === 'elite' ? 50 : 70;
        this.t = 0;
        this.vy = type === 'elite' ? 1.5 : 2;
    }
    update() {
        this.t++;
        if (this.type === 'elite') this.x += Math.sin(this.t * 0.05) * 2;
        else this.x += Math.sin(this.t * 0.04 + this.x) * 1.5;
        this.y += this.vy;
        this.fireCd++;
        if (this.fireCd >= this.fireRate) { this.fireCd = 0; this.fire(); }
    }
    fire() {
        const cx = this.x + this.w/2, cy = this.y + this.h;
        if (this.type === 'elite') {
            for (const vx of [-1.5, 0, 1.5])
                enemyBullets.push({ x: cx, y: cy, vx, vy: 4, r: 5, color: '#ff6600' });
        } else {
            enemyBullets.push({ x: cx, y: cy, vx: 0, vy: 4, r: 4, color: '#ff5555' });
        }
    }
    draw() {
        const cx = this.x + this.w/2, cy = this.y + this.h/2;
        ctx.save();
        const glow = this.type === 'elite' ? '#ff6600' : '#ff3333';
        ctx.shadowColor = glow; ctx.shadowBlur = this.type === 'elite' ? 20 : 15;
        if (hasAsset('enemy')) {
            ctx.filter = this.type === 'elite'
                ? 'brightness(1.8) saturate(2) hue-rotate(20deg)'
                : 'brightness(1.6) saturate(2)';
            ctx.drawImage(IMGS.enemy, this.x, this.y, this.w, this.h);
            ctx.filter = 'none';
        } else {
            ctx.fillStyle = this.type === 'elite' ? '#ff6600' : '#cc2222';
            ctx.beginPath();
            ctx.moveTo(cx, this.y + this.h);
            ctx.lineTo(this.x + this.w, this.y);
            ctx.lineTo(cx, this.y + this.h*0.35);
            ctx.lineTo(this.x, this.y);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = '#333'; ctx.fillRect(this.x, this.y-6, this.w, 3);
        ctx.fillStyle = '#ff4444'; ctx.fillRect(this.x, this.y-6, this.w*(this.hp/this.maxHp), 3);
    }
    hit(dmg) {
        this.hp -= dmg;
        return this.hp <= 0;
    }
}


// ============================================================
// 蛇形Boss - 每球独立 trailIdx，祖玛式断节后退
// ============================================================

const SEG_COUNT     = 7;
const SEG_HP        = [10, 20, 30, 40, 50, 60, 70];
const BALLS_PER_SEG = 5;
const BALL_R        = 18;
const BALL_SPACING  = BALL_R * 2;   // 36，球边缘刚好相接

// ============================================================
// 蛇形Boss - push轨迹 + 每球独立trailIdx + 祖玛断节后退
// ============================================================

const SEG_COUNT     = 7;
const SEG_HP        = [10, 20, 30, 40, 50, 60, 70];
const BALLS_PER_SEG = 5;
const BALL_R        = 18;
const BALL_SPACING  = BALL_R * 2;  // 36，球边缘相接

class SnakeBoss {
    constructor() {
        this.path    = this._buildPath();
        this.pathLen = this.path.length;
        this.headIdx = 0;

        // trail：push追加，trail[0]=最旧，trail[length-1]=最新
        // trailIdx=0 取最新，trailIdx越大取越旧的坐标
        this.trail = [];

        this.speed       = 6;
        this.normalSpeed = 2.2;
        this.entryDone   = false;

        this.headBall = { x: -999, y: -999 };

        this.segments = [];
        for (let s = 0; s < SEG_COUNT; s++) {
            const balls = [];
            for (let u = 0; u < BALLS_PER_SEG; u++) {
                const globalId = s * BALLS_PER_SEG + u + 1;
                balls.push({ trailIdx: globalId * BALL_SPACING, x: -999, y: -999 });
            }
            this.segments.push({
                index: s, hp: SEG_HP[s], maxHp: SEG_HP[s], dead: false, balls
            });
        }

        // 后退状态
        this.mode        = 'forward';
        this.breakPoint  = -1;   // 死亡节的 index
        this.retreatSpeed = 2;

        this.alive = true;
        this.t     = 0;

        // 预填充 trail，保证初始时所有球都有坐标
        const startPt = this.path[0];
        const need = SEG_COUNT * BALLS_PER_SEG * BALL_SPACING + 100;
        for (let i = 0; i < need; i++) this.trail.push({ x: startPt.x, y: startPt.y });
    }

    _buildPath() {
        const pts = [];
        const leftX = 60, rightX = W - 60;
        const laneStep = 90, spd = 2.2;
        const r = laneStep / 2;
        const arcSteps = Math.ceil(Math.PI * r / spd);
        let x = W / 2, y = -120, dir = 1;
        const totalLanes = Math.ceil((H + 600) / laneStep) + 4;
        for (let lane = 0; lane < totalLanes; lane++) {
            const arcCX = dir === 1 ? rightX - r : leftX + r;
            const arcCY = y + r;
            while (dir === 1 ? x < arcCX - 0.1 : x > arcCX + 0.1) {
                x += dir * spd;
                x = dir === 1 ? Math.min(x, arcCX) : Math.max(x, arcCX);
                pts.push({ x, y });
            }
            x = arcCX;
            for (let s = 0; s <= arcSteps; s++) {
                const a = -Math.PI / 2 + Math.PI * (s / arcSteps);
                pts.push({ x: arcCX + Math.cos(a) * r * dir, y: arcCY + Math.sin(a) * r });
            }
            x = arcCX; y += laneStep; dir = -dir;
        }
        return pts;
    }

    // trailIdx=0 → 最新坐标（trail末尾），trailIdx越大越旧
    _trailPt(idx) {
        const pos = this.trail.length - 1 - Math.min(idx, this.trail.length - 1);
        return this.trail[Math.max(0, pos)];
    }

    _firstAliveAfter(idx) {
        for (let i = idx + 1; i < SEG_COUNT; i++)
            if (!this.segments[i].dead) return this.segments[i];
        return null;
    }

    update() {
        this.t++;
        const maxIdx = this.pathLen - 1;

        // 入场减速
        if (!this.entryDone) {
            const pt = this.path[this.headIdx];
            if (pt && pt.y >= 150) {
                this.speed = Math.max(this.normalSpeed, this.speed * 0.94);
                if (this.speed <= this.normalSpeed + 0.05) { this.speed = this.normalSpeed; this.entryDone = true; }
            }
        }

        if (this.mode === 'forward') {
            // 头部前进，所有存活球 trailIdx+1（保持与头的相对距离）
            if (this.headIdx < maxIdx) this.headIdx++;
            for (const seg of this.segments) {
                if (seg.dead) continue;
                for (const ball of seg.balls) ball.trailIdx++;
            }
        } else {
            // 头部后退
            // breakPoint 前的球：trailIdx 不变 → trail 增长后取到更旧坐标 = 跟头一起退
            // breakPoint 及之后的球：trailIdx+1 → 抵消 trail 增长 = 坐标冻结
            this.headIdx = Math.max(0, this.headIdx - this.retreatSpeed);
            for (const seg of this.segments) {
                if (seg.dead) continue;
                for (const ball of seg.balls) {
                    if (seg.index >= this.breakPoint) ball.trailIdx++;
                }
            }
        }

        // 追加头部新坐标到 trail
        const headPt = this.path[Math.min(this.headIdx, maxIdx)];
        this.trail.push({ x: headPt.x, y: headPt.y });
        this.headBall.x = headPt.x;
        this.headBall.y = headPt.y;

        // 更新所有存活球坐标
        for (const seg of this.segments) {
            if (seg.dead) continue;
            for (const ball of seg.balls) {
                const pt = this._trailPt(ball.trailIdx);
                if (pt) { ball.x = pt.x; ball.y = pt.y; }
            }
        }

        // retreating：检查是否接上
        if (this.mode === 'retreating') {
            // 找 breakPoint 前最后一个存活节的最后一个球
            let frontLastBall = this.headBall;
            for (let i = this.breakPoint - 1; i >= 0; i--) {
                if (!this.segments[i].dead) {
                    frontLastBall = this.segments[i].balls[BALLS_PER_SEG - 1];
                    break;
                }
            }
            const targetSeg = this._firstAliveAfter(this.breakPoint);
            if (!targetSeg) {
                this.mode = 'forward'; this.breakPoint = -1;
            } else {
                const tb = targetSeg.balls[0];
                if (tb.x > -900) {
                    const dx = frontLastBall.x - tb.x, dy = frontLastBall.y - tb.y;
                    if (Math.sqrt(dx*dx + dy*dy) <= BALL_SPACING + 4) {
                        this._recalcTrailDists();
                        this.mode = 'forward'; this.breakPoint = -1;
                    }
                }
            }
        }

        // 头部射击
        if (this.t % 50 === 0 && headPt.y > -20) {
            enemyBullets.push({ x: headPt.x-8, y: headPt.y, vx: -0.5, vy: 4, r: 4, color: '#ff5555' });
            enemyBullets.push({ x: headPt.x,   y: headPt.y, vx: 0,    vy: 4, r: 4, color: '#ff5555' });
            enemyBullets.push({ x: headPt.x+8, y: headPt.y, vx: 0.5,  vy: 4, r: 4, color: '#ff5555' });
        }

        if (!this.segments.some(s => !s.dead)) { this.alive = false; return; }
        if (headPt.y > H + 350) this.alive = false;
    }

    _recalcTrailDists() {
        let dist = BALL_SPACING;
        for (const seg of this.segments) {
            if (seg.dead) continue;
            for (const ball of seg.balls) { ball.trailIdx = dist; dist += BALL_SPACING; }
        }
    }

    segKill(segIdx) {
        const seg = this.segments[segIdx];
        if (seg.dead) return;
        seg.dead = true;
        for (const ball of seg.balls)
            if (ball.x > -900) spawnExplosion(ball.x, ball.y, 8, `hsl(${segIdx*25},100%,60%)`, 1.2);
        const nextAlive = this._firstAliveAfter(segIdx);
        if (!nextAlive) return;
        this.mode = 'retreating';
        this.breakPoint = segIdx;
    }

    hit(segIdx, dmg) {
        const seg = this.segments[segIdx];
        if (!seg || seg.dead) return false;
        seg.hp -= dmg;
        if (seg.hp <= 0) { seg.hp = 0; this.segKill(segIdx); return true; }
        return false;
    }

    draw() {
        for (let s = SEG_COUNT - 1; s >= 0; s--) {
            const seg = this.segments[s];
            if (seg.dead) continue;
            for (const ball of seg.balls) {
                if (ball.x < -900) continue;
                const hue = s * 25;
                ctx.save();
                ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 12;
                ctx.fillStyle = `hsl(${hue},80%,45%)`;
                ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R - 1, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = `hsl(${hue},100%,70%)`; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.restore();
            }
            const mid = seg.balls[2];
            if (mid && mid.x > -900) {
                ctx.save();
                ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
                ctx.strokeText(seg.hp, mid.x, mid.y - 20);
                ctx.fillStyle = '#fff'; ctx.fillText(seg.hp, mid.x, mid.y - 20);
                ctx.restore();
            }
        }
        // 头部
        const hp = this.headBall;
        if (hp.y > -80 && hp.y < H + 80) {
            ctx.save();
            ctx.shadowColor = '#ff0080'; ctx.shadowBlur = 20;
            ctx.fillStyle = '#cc0066';
            ctx.beginPath(); ctx.arc(hp.x, hp.y, BALL_R + 2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(hp.x-7, hp.y-4, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(hp.x+7, hp.y-4, 4, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(hp.x-7, hp.y-4, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(hp.x+7, hp.y-4, 2, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    }

    getHitTargets() {
        const list = [];
        for (const seg of this.segments) {
            if (seg.dead) continue;
            for (const ball of seg.balls) {
                if (ball.x < -900) continue;
                list.push({ segIdx: seg.index, x: ball.x-BALL_R, y: ball.y-BALL_R, w: BALL_R*2, h: BALL_R*2 });
            }
        }
        return list;
    }
}
let snakeBoss = null;


// ---------- 背景 ----------
const stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.5 + 0.3,
    speed: 0.5 + Math.random() * 1.5,
    alpha: 0.3 + Math.random() * 0.7
}));
let bgOffset = 0;

function drawBackground() {
    if (hasAsset('bg')) {
        bgOffset = (bgOffset + 1) % H;
        ctx.drawImage(IMGS.bg, 0, bgOffset - H, W, H);
        ctx.drawImage(IMGS.bg, 0, bgOffset, W, H);
    } else {
        ctx.fillStyle = '#080c1e';
        ctx.fillRect(0, 0, W, H);
    }
    for (const s of stars) {
        s.y += s.speed;
        if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        ctx.globalAlpha = s.alpha * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (isRadarBurst) {
        ctx.save();
        ctx.globalAlpha = 0.12 + Math.random() * 0.08;
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        if (Math.random() < 0.25) {
            ctx.save();
            ctx.strokeStyle = `rgba(255,255,0,${0.3 + Math.random()*0.4})`;
            ctx.lineWidth = 1 + Math.random() * 2;
            ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 10;
            ctx.beginPath();
            const lx = Math.random() * W;
            ctx.moveTo(lx, 0);
            let cy2 = 0;
            while (cy2 < H) { cy2 += 30 + Math.random()*60; ctx.lineTo(lx + (Math.random()-0.5)*60, cy2); }
            ctx.stroke(); ctx.restore();
        }
    }
}

// ---------- 受击红边 ----------
function drawHitVignette() {
    if (player.invincible > 30) {
        const alpha = (player.invincible - 30) / 20 * 0.5;
        const grad = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.8);
        grad.addColorStop(0, 'rgba(255,0,0,0)');
        grad.addColorStop(1, `rgba(255,0,0,${alpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }
}

// ---------- 雷压系统 ----------
function updateRadarPressure() {
    if (!isRadarBurst) {
        radarPressure = Math.max(0, radarPressure - 0.15);
        if (radarPressure >= 100) triggerRadarBurst();
    } else {
        if (Date.now() > radarBurstEnd) { isRadarBurst = false; radarPressure = 0; }
    }
}
function triggerRadarBurst() {
    isRadarBurst = true;
    radarBurstEnd = Date.now() + 8000;
    enemyBullets.length = 0;
    for (let i = 0; i < 15; i++)
        spawnExplosion(Math.random()*W, Math.random()*H, 8, '#ffff00');
}
function addPressure(v) {
    if (!isRadarBurst) radarPressure = Math.min(100, radarPressure + v);
}

// ---------- 波次 ----------
let waveSpawnQueue = [], waveSpawnTimer = 0;

function spawnWave() {
    wave++;
    waveSpawnQueue = [];
    waveSpawnTimer = 0;
    enemyBullets.length = 0;

    if (wave === 1) {
        for (let i = 0; i < 5; i++) {
            const e = new Enemy(W/2, -40, 'normal');
            e._sT = 0;
            e._freq = (2 * Math.PI) / 480;
            e._amp = 200;
            e._angle = 0;
            e.update = function() {
                this._sT++;
                const prevX = this.x, prevY = this.y;
                this.x = W/2 - this.w/2 + Math.sin(this._sT * this._freq) * this._amp;
                this.y += 2.0;
                const dx = this.x - prevX, dy = this.y - prevY;
                this._angle = Math.atan2(dx, -dy);
                this.fireCd++;
                if (this.fireCd >= this.fireRate) { this.fireCd = 0; this.fire(); }
            };
            const origDraw = e.draw.bind(e);
            e.draw = function() {
                const cx = this.x + this.w/2, cy = this.y + this.h/2;
                ctx.save();
                ctx.translate(cx, cy); ctx.rotate(this._angle); ctx.translate(-cx, -cy);
                origDraw();
                ctx.restore();
            };
            waveSpawnQueue.push({ delay: i * 60, enemy: e });
        }
    } else if (wave === 2) {
        // 正三角：顶部1个，往下依次2、3、4个
        const rows = [1, 2, 3, 4];
        const colSpacing = 110;
        rows.forEach((count, rowIdx) => {
            for (let col = 0; col < count; col++) {
                const totalW = (count - 1) * colSpacing;
                const x = (W - totalW) / 2 + col * colSpacing - 28;
                const y = -60 - (rows.length - 1 - rowIdx) * 80;
                const type = rowIdx >= 2 ? 'elite' : 'normal';
                const e = new Enemy(x, y, type);
                e.update = function() {
                    this.t++;
                    this.y += 1.8;
                    this.fireCd++;
                    if (this.fireCd >= this.fireRate) { this.fireCd = 0; this.fire(); }
                };
                waveSpawnQueue.push({ delay: rowIdx * 20, enemy: e });
            }
        });
    } else if (wave === 3) {
        snakeBoss = new SnakeBoss();
    } else {
        const count = 4 + Math.floor((wave - 3) * 1.2);
        const cols = 4;
        for (let i = 0; i < count; i++) {
            const col = i % cols, row = Math.floor(i / cols);
            const type = Math.random() < 0.2 ? 'elite' : 'normal';
            const x = 40 + col * ((W - 80) / (cols - 1));
            const y = -60 - row * 70;
            waveSpawnQueue.push({ delay: row * 30, enemy: new Enemy(x, y, type) });
        }
    }
}

function updateWaveSpawn() {
    if (waveSpawnQueue.length === 0) return;
    waveSpawnTimer++;
    for (let i = waveSpawnQueue.length - 1; i >= 0; i--) {
        if (waveSpawnTimer >= waveSpawnQueue[i].delay) {
            enemies.push(waveSpawnQueue[i].enemy);
            waveSpawnQueue.splice(i, 1);
        }
    }
}

// ---------- HUD ----------
function drawHUD() {
    // 雷压条
    const bx = 10, by = H - 32, bw = 160, bh = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);
    const pct = radarPressure / 100;
    const grad = ctx.createLinearGradient(bx, 0, bx+bw, 0);
    grad.addColorStop(0, '#0044ff');
    grad.addColorStop(0.6, '#00ccff');
    grad.addColorStop(1, '#ffff00');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw * pct, bh);
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left';
    ctx.fillText(`雷压 ${Math.floor(radarPressure)}%`, bx+4, by+10);

    if (isRadarBurst) {
        const remain = Math.max(0, (radarBurstEnd - Date.now()) / 1000).toFixed(1);
        ctx.fillStyle = '#ffff00'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
        ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 10;
        ctx.fillText(`⚡ 雷暴模式 ${remain}s`, W/2, H - 16);
        ctx.shadowBlur = 0;
    }

    ctx.fillStyle = '#aaffff'; ctx.font = '12px Arial'; ctx.textAlign = 'right';
    ctx.fillText(`Wave ${wave}`, W - 10, H - 18);

    // 开火状态（F键切换）
    ctx.textAlign = 'left'; ctx.font = 'bold 11px Arial';
    ctx.fillStyle = firingEnabled ? '#00ff88' : '#ff4444';
    ctx.fillText(firingEnabled ? '● FIRE ON  [F]' : '○ FIRE OFF [F]', 10, 28);

    // HP
    ctx.textAlign = 'right';
    ctx.fillStyle = player.hp > 50 ? '#00ff88' : player.hp > 25 ? '#ffaa00' : '#ff3333';
    ctx.fillText(`HP: ${player.hp}`, W - 10, 28);

    // 暂停按钮
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W - 44, 8, 36, 28);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
    ctx.fillText('II', W - 26, 27);
}

// ---------- 碰撞 ----------
function rectsOverlap(ax, ay, aw, ah, bx2, by2, bw2, bh2) {
    return ax < bx2+bw2 && ax+aw > bx2 && ay < by2+bh2 && ay+ah > by2;
}
function circleRect(cx2, cy2, r, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(cx2, rx+rw));
    const nearY = Math.max(ry, Math.min(cy2, ry+rh));
    const dx = cx2-nearX, dy = cy2-nearY;
    return dx*dx + dy*dy < r*r;
}


// ---------- 暂停 ----------
let paused = false;
function togglePause() {
    if (gameState !== 'playing' && gameState !== 'paused') return;
    paused = !paused;
    gameState = paused ? 'paused' : 'playing';
}

// 暂停按钮点击
canvas.addEventListener('click', e => {
    if (gameState === 'gameover') { resetGame(); return; }
    if (gameState === 'start') { gameState = 'playing'; spawnWave(); return; }
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    if (mx >= W-44 && mx <= W-8 && my >= 8 && my <= 36) { togglePause(); return; }
});

function resetGame() {
    score = 0; wave = 0;
    radarPressure = 0; isRadarBurst = false;
    frameCount = 0; screenShake = 0;
    player.x = W/2 - 40; player.y = H - 120;
    player.hp = player.maxHp;
    player.invincible = 0; player.fireCd = 0;
    playerBullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    explosions.length = 0;
    hitFlashes.length = 0;
    waveSpawnQueue.length = 0;
    snakeBoss = null;
    gameState = 'playing';
    spawnWave();
}

// ---------- 开始界面 ----------
function drawStartScreen() {
    drawBackground();
    ctx.save();
    // 标题
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px Arial';
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#00ffff';
    ctx.fillText('雷霆裂空', W/2, H/2 - 120);
    ctx.font = 'bold 24px Arial';
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('THUNDER FORCE', W/2, H/2 - 75);

    // 开始按钮
    const bx = W/2 - 100, by = H/2 - 20, bw = 200, bh = 56;
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20;
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(0,255,255,0.1)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#00ffff'; ctx.font = 'bold 22px Arial';
    ctx.fillText('点击开始', W/2, by + 36);

    // 操作说明
    ctx.fillStyle = 'rgba(170,255,255,0.7)'; ctx.font = '14px Arial';
    ctx.fillText('WASD / 方向键 移动', W/2, H/2 + 80);
    ctx.fillText('积累雷压触发雷暴模式 ⚡', W/2, H/2 + 105);
    ctx.restore();
}

// ---------- 暂停界面 ----------
function drawPauseScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px Arial';
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#00ffff';
    ctx.fillText('暂停', W/2, H/2 - 30);
    ctx.font = '18px Arial'; ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('按 ESC 或点击 II 继续', W/2, H/2 + 20);
    ctx.restore();
}

// ---------- Game Over 界面 ----------
function drawGameOverScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px Arial';
    ctx.shadowColor = '#ff0080'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff0080';
    ctx.fillText('GAME OVER', W/2, H/2 - 80);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#00ffff'; ctx.font = '26px Arial';
    ctx.fillText(`得分: ${score}`, W/2, H/2 - 20);
    ctx.fillText(`波次: ${wave}`, W/2, H/2 + 20);
    ctx.fillStyle = '#ffffff'; ctx.font = '18px Arial';
    ctx.fillText('点击屏幕重新开始', W/2, H/2 + 70);
    ctx.restore();
}

// ---------- 主更新 ----------
function update() {
    if (gameState !== 'playing') return;
    frameCount++;

    // 震动衰减
    if (screenShake > 0) screenShake--;

    player.update();
    updateWaveSpawn();

    // 更新子弹
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b = playerBullets[i];
        b.x += b.vx; b.y += b.vy;
        if (b.y < -10) playerBullets.splice(i, 1);
    }
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx; b.y += b.vy;
        if (b.y > H+10 || b.x < -10 || b.x > W+10) enemyBullets.splice(i, 1);
    }

    // 更新普通敌机
    for (const e of enemies) e.update();

    // 更新蛇Boss
    if (snakeBoss && snakeBoss.alive) snakeBoss.update();

    // 玩家子弹碰撞
    for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
        const b = playerBullets[bi];
        let hit = false;

        // vs 普通敌机
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            if (circleRect(b.x, b.y, b.r, e.x, e.y, e.w, e.h)) {
                const dmg = isRadarBurst ? 2 : 1;
                spawnHitFlash(b.x, b.y, '#ffffff');
                if (e.hit(dmg)) {
                    score += e.type === 'elite' ? 50 : 10;
                    addPressure(e.type === 'elite' ? 20 : 12);
                    spawnExplosion(e.x+e.w/2, e.y+e.h/2, 12, e.type === 'elite' ? '#ff6600' : '#ff4444');
                    enemies.splice(ei, 1);
                }
                hit = true; break;
            }
        }

        // vs 蛇Boss
        if (!hit && snakeBoss && snakeBoss.alive) {
            for (const t of snakeBoss.getHitTargets()) {
                if (circleRect(b.x, b.y, b.r, t.x, t.y, t.w, t.h)) {
                    spawnHitFlash(b.x, b.y, t.type === 'head' ? '#ff88aa' : '#ffffff');
                    if (t.type === 'head') {
                        spawnExplosion(t.x+t.w/2, t.y+t.h/2, 3, '#ff0080');
                    } else {
                        const dmg = isRadarBurst ? 2 : 1;
                        t.seg.hp -= dmg;
                        spawnExplosion(t.x+t.w/2, t.y+t.h/2, 3, '#ff6600');
                        if (t.seg.hp <= 0) {
                            score += t.seg.maxHp * 5;
                            addPressure(10);
                            snakeBoss.killSegment(t.seg.index);
                        }
                    }
                    hit = true; break;
                }
            }
        }

        if (hit) playerBullets.splice(bi, 1);
    }

    // 敌方子弹 vs 玩家
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        if (circleRect(b.x, b.y, b.r, player.x+6, player.y+6, player.w-12, player.h-12)) {
            player.hit(10);
            spawnExplosion(b.x, b.y, 5, '#ff4444');
            enemyBullets.splice(i, 1);
        }
    }

    // 敌机体积 vs 玩家
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (rectsOverlap(player.x+6, player.y+6, player.w-12, player.h-12, e.x, e.y, e.w, e.h)) {
            player.hit(20);
            spawnExplosion(e.x+e.w/2, e.y+e.h/2, 15, '#ff6600');
            enemies.splice(i, 1);
        }
    }

    // 蛇Boss体积 vs 玩家
    if (snakeBoss && snakeBoss.alive) {
        for (const t of snakeBoss.getBodyCollisionTargets()) {
            if (rectsOverlap(player.x+6, player.y+6, player.w-12, player.h-12, t.x, t.y, t.w, t.h)) {
                player.hit(15);
                spawnExplosion(t.x+t.w/2, t.y+t.h/2, 8, '#ff0080');
                break;
            }
        }
    }

    // 清理出界敌机
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].y > H + 60) enemies.splice(i, 1);
    }

    // 波次推进
    const snakeDone = !snakeBoss || !snakeBoss.alive;
    if (enemies.length === 0 && waveSpawnQueue.length === 0 && snakeDone) {
        snakeBoss = null;
        spawnWave();
    }

    updateRadarPressure();

    // 同步 DOM HUD（兼容保留）
    const scoreEl = document.getElementById('score');
    const healthEl = document.getElementById('health');
    const radarEl = document.getElementById('radarPressure');
    if (scoreEl) scoreEl.textContent = `Score: ${score}`;
    if (healthEl) healthEl.textContent = `HP: ${player.hp}`;
    if (radarEl) radarEl.textContent = `雷压: ${Math.floor(radarPressure)}%`;
}

// ---------- 主渲染 ----------
function render() {
    // 震动偏移
    if (screenShake > 0) {
        ctx.save();
        ctx.translate((Math.random()-0.5)*6, (Math.random()-0.5)*6);
    }

    if (gameState === 'start') {
        drawStartScreen();
    } else {
        drawBackground();
        updateDrawExplosions();
        updateDrawHitFlashes();
        for (const e of enemies) e.draw();
        if (snakeBoss && snakeBoss.alive) snakeBoss.draw();
        drawEnemyBullets();
        drawPlayerBullets();
        player.draw();
        drawHUD();
        drawHitVignette();

        if (gameState === 'paused') drawPauseScreen();
        if (gameState === 'gameover') drawGameOverScreen();
    }

    if (screenShake > 0) ctx.restore();
}

// ---------- 主循环 ----------
function loop() {
    update();
    render();
    requestAnimationFrame(loop);
}

loop();
