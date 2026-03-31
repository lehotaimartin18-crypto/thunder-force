// ============================================================
// 雷霆裂空 - Thunder Force  |  game.js
// ============================================================

const W = 540, H = 960;

// ---------- 素材加载 ----------
const IMGS = {};
const imgSrcs = {
    player:    'player.png',
    enemy:     'enemy.png',
    bg:        'bg.png',
    bullet:    'bullet.png',
    explosion: 'explosion.png'
};
let assetsLoaded = 0;
const totalAssets = Object.keys(imgSrcs).length;

for (const [key, src] of Object.entries(imgSrcs)) {
    const img = new Image();
    img.onload  = () => { assetsLoaded++; };
    img.onerror = () => { assetsLoaded++; }; // 加载失败也继续，fallback 到 canvas 绘制
    img.src = src;
    IMGS[key] = img;
}

// ---------- canvas 初始化 ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

// ---------- 输入 ----------
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; e.preventDefault(); });
window.addEventListener('keyup',   e => { keys[e.key] = false; });

// 触摸支持
let touchX = null, touchY = null;
canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    touchX = t.clientX; touchY = t.clientY;
}, { passive: true });
canvas.addEventListener('touchmove', e => {
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    player.x = (t.clientX - rect.left) * scaleX - player.w / 2;
    player.y = (t.clientY - rect.top)  * scaleY - player.h / 2;
    player.x = Math.max(0, Math.min(W - player.w, player.x));
    player.y = Math.max(0, Math.min(H - player.h, player.y));
    e.preventDefault();
}, { passive: false });

// 鼠标左键切换开火
let firingEnabled = true;
canvas.addEventListener('mousedown', e => {
    if (e.button === 0 && !gameOver) firingEnabled = !firingEnabled;
});

// ---------- 状态 ----------
let score = 0, wave = 0, radarPressure = 0;
let isRadarBurst = false, radarBurstEnd = 0;
let gameOver = false;
let frameCount = 0;

// ---------- 玩家 ----------
const player = {
    x: W / 2 - 40, y: H - 120,
    w: 80, h: 80,       // 显示大小放大1倍（碰撞判定仍用内缩值）
    hp: 100, maxHp: 100,
    speed: 5,
    invincible: 0,   // 无敌帧数
    fireCd: 0,
    fireRate: 16,     // 每16帧射一次（原8帧减半）

    update() {
        if (keys['ArrowLeft'] || keys['a']) this.x -= this.speed;
        if (keys['ArrowRight'] || keys['d']) this.x += this.speed;
        if (keys['ArrowUp']   || keys['w']) this.y -= this.speed;
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
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        ctx.save();

        // 雷暴时加黄色发光
        if (isRadarBurst) {
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 25;
        } else {
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 15;
        }

        // 无敌闪烁
        if (this.invincible > 0 && Math.floor(this.invincible / 4) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        if (IMGS.player && IMGS.player.complete && IMGS.player.naturalWidth > 0) {
            // 用 AI 生成的玩家飞机图
            ctx.drawImage(IMGS.player, this.x, this.y, this.w, this.h);
        } else {
            // fallback
            ctx.fillStyle = isRadarBurst ? '#ffff00' : '#00e5ff';
            ctx.beginPath();
            ctx.moveTo(cx, this.y);
            ctx.lineTo(this.x + this.w, this.y + this.h);
            ctx.lineTo(cx, this.y + this.h * 0.65);
            ctx.lineTo(this.x, this.y + this.h);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // 血条
        const bw = this.w;
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x, this.y + this.h + 4, bw, 4);
        ctx.fillStyle = this.hp > 50 ? '#00ff88' : this.hp > 25 ? '#ffaa00' : '#ff3333';
        ctx.fillRect(this.x, this.y + this.h + 4, bw * (this.hp / this.maxHp), 4);
    },

    hit(dmg) {
        if (this.invincible > 0 || isRadarBurst) return;
        this.hp -= dmg;
        this.invincible = 40;
        spawnExplosion(this.x + this.w / 2, this.y + this.h / 2, 20, '#ff4444');
        if (this.hp <= 0) { this.hp = 0; gameOver = true; }
    }
};

// ---------- 子弹池 ----------
const playerBullets = [];
const enemyBullets  = [];

function spawnPlayerBullet() {
    const cx = player.x + player.w / 2;
    // 两列平行弹道（雷暴时四列）
    const offsets = isRadarBurst ? [-18, -6, 6, 18] : [-8, 8];
    for (const offset of offsets) {
        playerBullets.push({ x: cx + offset, y: player.y, vx: 0, vy: -10, r: 5 });
    }
}

function drawPlayerBullets() {
    ctx.save();
    for (const b of playerBullets) {
        const x = b.x, y = b.y, r = b.r;

        // 外层光晕
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
        glow.addColorStop(0, 'rgba(0,255,255,0.5)');
        glow.addColorStop(1, 'rgba(0,255,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(x, y + r * 2, r * 4, r * 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 子弹主体（渐变，无黑底）
        const bodyGrad = ctx.createLinearGradient(x, y - r * 2.5, x, y + r * 2.5);
        bodyGrad.addColorStop(0, 'rgba(255,255,255,1)');
        bodyGrad.addColorStop(0.3, 'rgba(0,255,255,1)');
        bodyGrad.addColorStop(1, 'rgba(0,100,255,0)');
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.7, r * 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 高亮核心
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(x, y - r * 0.5, r * 0.3, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawEnemyBullets() {
    ctx.save();
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff5555';
    for (const b of enemyBullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ---------- 敌机 ----------
const enemies = [];

class Enemy {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.type = type; // 'normal' | 'elite' | 'boss'
        this.w = type === 'boss' ? 80 : type === 'elite' ? 72 : 56;
        this.h = type === 'boss' ? 80 : type === 'elite' ? 72 : 56;
        this.hp = type === 'boss' ? 80 : type === 'elite' ? 5 : 2;
        this.maxHp = this.hp;
        this.fireCd = Math.random() * 60 | 0;
        this.fireRate = type === 'boss' ? 30 : type === 'elite' ? 50 : 70;
        this.t = 0;
        this.vy = type === 'boss' ? 0.8 : type === 'elite' ? 1.5 : 2;
        this.vx = 0;
        this.phase = 1;
        // boss 停在上方
        this.targetY = type === 'boss' ? 80 : -1;
        this.arrived = type !== 'boss';
    }

    update() {
        this.t++;
        if (!this.arrived) {
            this.y += this.vy * 2;
            if (this.y >= this.targetY) { this.y = this.targetY; this.arrived = true; }
            return;
        }

        if (this.type === 'boss') {
            this.x = W / 2 - this.w / 2 + Math.sin(this.t * 0.02) * 120;
        } else if (this.type === 'elite') {
            this.x += Math.sin(this.t * 0.05) * 2;
            this.y += this.vy;
        } else {
            this.x += Math.sin(this.t * 0.04 + this.x) * 1.5;
            this.y += this.vy;
        }

        // 射击
        this.fireCd++;
        if (this.fireCd >= this.fireRate) {
            this.fireCd = 0;
            this.fire();
        }
    }

    fire() {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h;
        if (this.type === 'boss') {
            const count = this.phase === 2 ? 8 : 5;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i + this.t * 0.02;
                enemyBullets.push({ x: cx, y: cy, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3 + 1, r: 6 });
            }
        } else if (this.type === 'elite') {
            // 三向弹
            for (const vx of [-1, 0, 1]) {
                enemyBullets.push({ x: cx, y: cy, vx: vx * 1.5, vy: 4, r: 5 });
            }
        } else {
            enemyBullets.push({ x: cx, y: cy, vx: 0, vy: 4, r: 4 });
        }
    }

    draw() {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        ctx.save();

        if (this.type === 'boss') {
            ctx.shadowColor = '#ff0080';
            ctx.shadowBlur = 25;

            if (IMGS.enemy && IMGS.enemy.complete && IMGS.enemy.naturalWidth > 0) {
                // AI 素材放大显示 BOSS
                ctx.drawImage(IMGS.enemy, this.x, this.y, this.w, this.h);
            } else {
                ctx.fillStyle = '#660033';
                ctx.beginPath();
                ctx.arc(cx, cy, this.w / 2 - 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // 旋转炮口装饰
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI / 2) * i + this.t * 0.03;
                ctx.fillStyle = '#ff0080';
                ctx.shadowColor = '#ff0080';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(cx + Math.cos(a) * (this.w / 2 - 6), cy + Math.sin(a) * (this.h / 2 - 6), 5, 0, Math.PI * 2);
                ctx.fill();
            }

            // BOSS 血条
            const bw = 200, bh = 10;
            const bx = W / 2 - bw / 2, by = 15;
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#330011';
            ctx.fillRect(bx, by, bw, bh);
            ctx.fillStyle = '#ff0080';
            ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
            ctx.strokeStyle = '#ff0080';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('BOSS', W / 2, by - 2);

        } else {
            // 普通 / 精英敌机用 AI 素材
            const glow = this.type === 'elite' ? '#ff6600' : '#ff3333';
            ctx.shadowColor = glow;
            ctx.shadowBlur = this.type === 'elite' ? 20 : 15;

            if (IMGS.enemy && IMGS.enemy.complete && IMGS.enemy.naturalWidth > 0) {
                // 提亮滤镜
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
                ctx.lineTo(cx, this.y + this.h * 0.35);
                ctx.lineTo(this.x, this.y);
                ctx.closePath();
                ctx.fill();
            }
        }

        ctx.restore();

        // 小血条（非boss）
        if (this.type !== 'boss') {
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x, this.y - 6, this.w, 3);
            ctx.fillStyle = '#ff4444';
            ctx.fillRect(this.x, this.y - 6, this.w * (this.hp / this.maxHp), 3);
        }
    }

    hit(dmg) {
        this.hp -= dmg;
        if (this.hp <= this.maxHp / 2 && this.phase === 1) this.phase = 2;
        return this.hp <= 0;
    }
}

// ---------- 爆炸粒子 ----------
const explosions = [];

function spawnExplosion(x, y, count = 12, color = '#00ffff') {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        explosions.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30 + Math.random() * 20 | 0,
            maxLife: 50,
            r: 2 + Math.random() * 3,
            color
        });
    }
}

function updateDrawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const p = explosions[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.1;
        p.life--;
        if (p.life <= 0) { explosions.splice(i, 1); continue; }
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;

        if (IMGS.explosion && IMGS.explosion.complete && IMGS.explosion.naturalWidth > 0) {
            // 用 AI 爆炸素材，随粒子扩散缩放
            const size = p.r * 6 * (1 - alpha * 0.3);
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.drawImage(IMGS.explosion, p.x - size / 2, p.y - size / 2, size, size);
        } else {
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// ---------- 背景星空 ----------
const stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.5 + 0.3,
    speed: 0.5 + Math.random() * 1.5,
    alpha: 0.3 + Math.random() * 0.7
}));

// 背景滚动偏移
let bgOffset = 0;

function drawBackground() {
    // 用 AI 生成的背景图滚动
    if (IMGS.bg && IMGS.bg.complete && IMGS.bg.naturalWidth > 0) {
        bgOffset = (bgOffset + 1) % H;
        // 两张拼接实现无缝滚动
        ctx.drawImage(IMGS.bg, 0, bgOffset - H, W, H);
        ctx.drawImage(IMGS.bg, 0, bgOffset, W, H);
    } else {
        ctx.fillStyle = '#080c1e';
        ctx.fillRect(0, 0, W, H);
    }

    // 星星叠加
    for (const s of stars) {
        s.y += s.speed;
        if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        ctx.globalAlpha = s.alpha * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 雷暴模式特效
    if (isRadarBurst) {
        ctx.save();
        ctx.globalAlpha = 0.15 + Math.random() * 0.1;
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        if (Math.random() < 0.3) {
            ctx.save();
            ctx.strokeStyle = `rgba(255,255,0,${0.3 + Math.random() * 0.5})`;
            ctx.lineWidth = 1 + Math.random() * 2;
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            const lx = Math.random() * W;
            ctx.moveTo(lx, 0);
            let cy2 = 0;
            while (cy2 < H) {
                cy2 += 30 + Math.random() * 60;
                ctx.lineTo(lx + (Math.random() - 0.5) * 60, cy2);
            }
            ctx.stroke();
            ctx.restore();
        }
    }
}

// ---------- 雷压系统 ----------
function updateRadarPressure() {
    if (!isRadarBurst) {
        radarPressure = Math.max(0, radarPressure - 0.2);
        if (radarPressure >= 100) triggerRadarBurst();
    } else {
        if (Date.now() > radarBurstEnd) {
            isRadarBurst = false;
            radarPressure = 0;
        }
    }
}

function triggerRadarBurst() {
    isRadarBurst = true;
    radarBurstEnd = Date.now() + 8000;
    enemyBullets.length = 0;
    for (let i = 0; i < 15; i++) {
        spawnExplosion(Math.random() * W, Math.random() * H, 8, '#ffff00');
    }
}

function addPressure(v) {
    if (!isRadarBurst) radarPressure = Math.min(100, radarPressure + v);
}

// ---------- 蛇形敌人 ----------
const SEG_HP = [10, 20, 30, 40, 50, 60, 70]; // 7节血量，从头到尾

class SnakeBall {
    constructor(isHead, ballIndex, segment) {
        this.isHead = isHead;
        this.ballIndex = ballIndex;
        this.segment = segment;
        this.w = 42; this.h = 42;  // 28 × 1.5
        this.x = -999; this.y = -999;
        this.dead = false;
        this.fireCd = 0;
        this.fireRate = 50;
        this.segIndex = isHead ? 0 : Math.ceil(ballIndex / 5);
    }

    setPos(x, y) {
        this.x = x - this.w / 2;
        this.y = y - this.h / 2;
    }

    update() {
        if (!this.isHead) return;
        this.fireCd++;
        if (this.fireCd >= this.fireRate) {
            this.fireCd = 0;
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h;
            enemyBullets.push({ x: cx - 8, y: cy, vx: -0.5, vy: 4, r: 4 });
            enemyBullets.push({ x: cx,     y: cy, vx: 0,    vy: 4, r: 4 });
            enemyBullets.push({ x: cx + 8, y: cy, vx: 0.5,  vy: 4, r: 4 });
        }
    }

    draw() {
        if (this.dead || this.x < -100) return;
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        ctx.save();
        if (this.isHead) {
            ctx.shadowColor = '#ff0080';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#cc0066';
            ctx.beginPath();
            ctx.arc(cx, cy, this.w / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(cx - 6, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + 6, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(cx - 6, cy - 4, 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + 6, cy - 4, 2, 0, Math.PI * 2); ctx.fill();
        } else {
            const hue = this.segIndex * 25;
            ctx.shadowColor = `hsl(${hue},100%,60%)`;
            ctx.shadowBlur = 10;
            ctx.fillStyle = `hsl(${hue},80%,45%)`;
            ctx.beginPath();
            ctx.arc(cx, cy, this.w / 2 - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `hsl(${hue},100%,70%)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    }
}

// 每节5个球，共享血量，血量数字显示在第3个球正上方
class SnakeSegment {
    constructor(segIndex) {
        this.segIndex = segIndex; // 0~6
        this.maxHp = SEG_HP[segIndex];
        this.hp = this.maxHp;
        this.dead = false;
        // 5个球，ballIndex = segIndex*5+1 ~ segIndex*5+5
        this.balls = [];
        for (let u = 0; u < 5; u++) {
            const ballIndex = segIndex * 5 + 1 + u;
            this.balls.push(new SnakeBall(false, ballIndex, this));
        }
    }

    hit(dmg) {
        if (this.dead) return false;
        this.hp -= dmg;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            for (const b of this.balls) b.dead = true;
        }
        return this.dead;
    }

    // 中间球（第3个，index=2）的中心坐标
    getMidBallCenter() {
        const b = this.balls[2];
        if (!b || b.x < -100) return null;
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }

    draw() {
        if (this.dead) return;
        for (const b of this.balls) b.draw();

        // 血量数字：白色填充 + 黑色描边，28px，显示在第3个球正上方
        const mid = this.getMidBallCenter();
        if (!mid) return;
        ctx.save();
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeText(this.hp, mid.x, mid.y - 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.hp, mid.x, mid.y - 24);
        ctx.restore();
    }
}

class SnakeBoss {
    constructor() {
        this.speed = 2.2;
        this.leftX = 50;
        this.rightX = W - 50;
        this.laneStep = 80;
        this.ballSpacing = 18;

        this.pathHistory = this._buildPath();

        // 每个节有独立的 segPathIdx，初始按位置分散
        // 节s第一个球在头部后 (s+1)*5*ballSpacing 个路径点
        // 头部起始索引要足够大，保证所有节都有非负索引
        const totalOffset = 7 * 5 * this.ballSpacing; // 630
        this.pathIdx = totalOffset;

        this.headBall = new SnakeBall(true, 0, null);

        this.segments = [];
        for (let s = 0; s < 7; s++) {
            const seg = new SnakeSegment(s);
            seg.segPathIdx = totalOffset - (s + 1) * 5 * this.ballSpacing;
            this.segments.push(seg);
        }

        this.alive = true;
        this.t = 0;
    }

    _buildPath() {
        const pts = [];
        const r = this.laneStep / 2;
        const arcSteps = Math.ceil(Math.PI * r / this.speed);
        let x = W / 2, y = -60;
        let dir = 1;
        const lanes = Math.ceil((H + 300) / this.laneStep) + 3;

        for (let lane = 0; lane < lanes; lane++) {
            const arcCX = dir === 1 ? this.rightX - r : this.leftX + r;
            const arcCY = y + r;
            while (dir === 1 ? x < arcCX - 0.1 : x > arcCX + 0.1) {
                x += dir * this.speed;
                x = dir === 1 ? Math.min(x, arcCX) : Math.max(x, arcCX);
                pts.push({ x, y });
            }
            x = arcCX;
            for (let s = 0; s <= arcSteps; s++) {
                const a = -Math.PI / 2 + Math.PI * (s / arcSteps);
                const ax = arcCX + Math.cos(a) * r * dir;
                const ay = arcCY + Math.sin(a) * r;
                pts.push({ x: ax, y: ay });
            }
            x = arcCX;
            y += this.laneStep;
            dir = -dir;
        }
        return pts;
    }

    update() {
        this.t++;
        const maxIdx = this.pathHistory.length - 1;

        // 找第一个存活节（锚点）
        let anchorSeg = null;
        let anchorSegIdx = -1;
        for (let i = 0; i < this.segments.length; i++) {
            if (!this.segments[i].dead) { anchorSeg = this.segments[i]; anchorSegIdx = i; break; }
        }
        if (!anchorSeg) { this.alive = false; return; }

        // 头部目标 = 锚点 segPathIdx + ballSpacing
        const targetHead = anchorSeg.segPathIdx + this.ballSpacing;
        const aligned = this.pathIdx <= targetHead; // 头部已接上锚点

        if (aligned) {
            // 已接上：头部和锚点一起正常前进
            if (this.pathIdx < maxIdx) this.pathIdx++;
            if (anchorSeg.segPathIdx < maxIdx) anchorSeg.segPathIdx++;
            // 锚点之后的节也一起前进
            for (let i = anchorSegIdx + 1; i < this.segments.length; i++) {
                const seg = this.segments[i];
                if (!seg.dead && seg.segPathIdx < maxIdx) seg.segPathIdx++;
            }
        } else {
            // 未接上：头部每帧退2步，锚点及之后的节暂停
            this.pathIdx = Math.max(targetHead, this.pathIdx - 2);
            // 锚点及之后的节全部暂停（segPathIdx 不变）
        }

        // 头部位置
        this.headBall.setPos(this.pathHistory[this.pathIdx].x, this.pathHistory[this.pathIdx].y);
        this.headBall.update();

        // 锚点之前的存活节从头部链式计算（跟着头部一起退）
        let prevIdx = this.pathIdx;
        for (let i = 0; i < anchorSegIdx; i++) {
            const seg = this.segments[i];
            if (seg.dead) continue;
            let idx = prevIdx - this.ballSpacing;
            seg.segPathIdx = idx;
            for (const ball of seg.balls) {
                const pt = this.pathHistory[Math.max(0, idx)];
                ball.setPos(pt.x, pt.y);
                idx -= this.ballSpacing;
            }
            prevIdx = seg.segPathIdx;
        }

        // 锚点及之后的节用各自的 segPathIdx
        for (let i = anchorSegIdx; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.dead) continue;
            let idx = seg.segPathIdx;
            for (const ball of seg.balls) {
                const pt = this.pathHistory[Math.max(0, idx)];
                ball.setPos(pt.x, pt.y);
                idx -= this.ballSpacing;
            }
        }

        this.alive = this.segments.some(s => !s.dead);
    }

    draw() {
        for (let s = this.segments.length - 1; s >= 0; s--) {
            this.segments[s].draw();
        }
        this.headBall.draw();
    }

    getHitTargets() {
        const list = [];
        if (!this.headBall.dead) {
            list.push({ type: 'head', ref: null, seg: null, x: this.headBall.x, y: this.headBall.y, w: this.headBall.w, h: this.headBall.h });
        }
        for (const seg of this.segments) {
            if (seg.dead) continue;
            for (const ball of seg.balls) {
                if (!ball.dead) {
                    list.push({ type: 'seg', ref: ball, seg: seg, x: ball.x, y: ball.y, w: ball.w, h: ball.h });
                }
            }
        }
        return list;
    }
}

let snakeBoss = null;

// ---------- 波次生成 ----------
// 关卡系统：3波固定设计
// wave=1: S形曲线5敌，间隔入场
// wave=2: 三角阵型10敌（1+2+3+4）
// wave=3: 蛇形Boss

let waveSpawnQueue = [];   // 待生成的敌人队列 [{delay, enemy}]
let waveSpawnTimer = 0;
let waveCleared = false;

function spawnWave() {
    wave++;
    waveSpawnQueue = [];
    waveSpawnTimer = 0;
    waveCleared = false;

    if (wave === 1) {
        // Wave 1: 5个敌人，一个完整S曲线（sin 0~2π），振幅接近屏幕宽，飞机朝向跟切线，间隔入场
        for (let i = 0; i < 5; i++) {
            const e = new Enemy(W / 2, -40, 'normal');
            e._sT = 0;
            // S曲线总帧数：让 sin 走完 2π 时 y 刚好穿过屏幕
            // y 速度 2.0，屏幕高 H=960，需要约 480 帧走完
            // sin 周期 = 480 帧，即 freq = 2π/480
            e._freq = (2 * Math.PI) / 480;
            e._amp = 200; // 振幅（左右各200px，总宽400px）
            e._angle = 0; // 飞机旋转角
            e.update = function() {
                this._sT++;
                const prevX = this.x;
                const prevY = this.y;
                this.x = W / 2 - this.w / 2 + Math.sin(this._sT * this._freq) * this._amp;
                this.y += 2.0;
                // 切线方向 = 当前帧位移方向
                const dx = this.x - prevX;
                const dy = this.y - prevY;
                this._angle = Math.atan2(dx, -dy); // 相对于向上的偏转角
            };
            e._drawAngle = () => e._angle;
            // 覆盖 draw，加旋转
            const origDraw = e.draw.bind(e);
            e.draw = function() {
                const cx = this.x + this.w / 2;
                const cy = this.y + this.h / 2;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(this._angle);
                ctx.translate(-cx, -cy);
                origDraw();
                ctx.restore();
            };
            waveSpawnQueue.push({ delay: i * 60, enemy: e });
        }
    } else if (wave === 2) {
        // Wave 2: 正三角，1个在最下（最近玩家），4个在最上
        const rows = [1, 2, 3, 4];
        const colSpacing = (W - 80) / 3 * 1.5; // 间距放大1.5倍
        rows.forEach((count, rowIdx) => {
            for (let col = 0; col < count; col++) {
                const totalW = (count - 1) * colSpacing;
                const startX = (W - totalW) / 2;
                const x = startX + col * colSpacing - 28; // 偏移改为半个敌人宽
                const y = -60 - rowIdx * 80;
                const e = new Enemy(x, y, rowIdx >= 2 ? 'elite' : 'normal');
                e.update = function() {
                    this.t++;
                    this.y += 1.8;
                };
                waveSpawnQueue.push({ delay: 0, enemy: e });
            }
        });
    } else if (wave === 3) {
        // Wave 3: 蛇形Boss
        snakeBoss = new SnakeBoss();
    } else {
        // wave > 3: 循环随机波次
        const count = 4 + Math.floor((wave - 3) * 1.2);
        const cols = 4;
        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const type = Math.random() < 0.2 ? 'elite' : 'normal';
            const x = 40 + col * ((W - 80) / (cols - 1));
            const y = -60 - row * 70;
            enemies.push(new Enemy(x, y, type));
        }
    }
}

function updateWaveSpawn() {
    if (waveSpawnQueue.length === 0) return;
    waveSpawnTimer++;
    for (let i = waveSpawnQueue.length - 1; i >= 0; i--) {
        const item = waveSpawnQueue[i];
        if (waveSpawnTimer >= item.delay) {
            enemies.push(item.enemy);
            waveSpawnQueue.splice(i, 1);
        }
    }
}

// ---------- HUD ----------
function drawHUD() {
    // 雷压条
    const bx = 10, by = H - 30, bw = 160, bh = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);

    const pct = radarPressure / 100;
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#0044ff');
    grad.addColorStop(0.6, '#00ccff');
    grad.addColorStop(1, '#ffff00');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw * pct, bh);

    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`雷压 ${Math.floor(radarPressure)}%`, bx + 4, by + 10);

    if (isRadarBurst) {
        const remain = Math.max(0, (radarBurstEnd - Date.now()) / 1000).toFixed(1);
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 10;
        ctx.fillText(`⚡ 雷暴模式 ${remain}s`, W / 2, H - 18);
        ctx.shadowBlur = 0;
    }

    // 波次
    ctx.fillStyle = '#aaffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`Wave ${wave}`, W - 10, H - 18);
}

// ---------- 碰撞 ----------
function rectsOverlap(ax, ay, aw, ah, bx2, by2, bw2, bh2) {
    return ax < bx2 + bw2 && ax + aw > bx2 && ay < by2 + bh2 && ay + ah > by2;
}

function circleRect(cx2, cy2, r, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(cx2, rx + rw));
    const nearY = Math.max(ry, Math.min(cy2, ry + rh));
    const dx = cx2 - nearX, dy = cy2 - nearY;
    return dx * dx + dy * dy < r * r;
}

// ---------- 主循环 ----------
function update() {
    if (gameOver) return;
    frameCount++;

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
        if (b.y > H + 10 || b.x < -10 || b.x > W + 10) {
            enemyBullets.splice(i, 1);
        }
    }

    // 更新敌机
    for (const e of enemies) e.update();

    // 更新蛇形Boss
    if (snakeBoss && snakeBoss.alive) {
        snakeBoss.update();
    }

    // 玩家子弹 vs 普通敌机
    for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
        const b = playerBullets[bi];
        let hit = false;

        // vs 普通敌机
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            if (circleRect(b.x, b.y, b.r, e.x, e.y, e.w, e.h)) {
                const dmg = isRadarBurst ? 2 : 1;
                if (e.hit(dmg)) {
                    const pts = e.type === 'elite' ? 50 : 10;
                    score += pts;
                    addPressure(e.type === 'elite' ? 20 : 12);
                    spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 12,
                        e.type === 'elite' ? '#ff6600' : '#ff4444');
                    enemies.splice(ei, 1);
                }
                hit = true;
                break;
            }
        }

        // vs 蛇形Boss
        if (!hit && snakeBoss && snakeBoss.alive) {
            for (const t of snakeBoss.getHitTargets()) {
                if (circleRect(b.x, b.y, b.r, t.x, t.y, t.w, t.h)) {
                    if (t.type === 'head') {
                        // 头部：只触发小爆炸，不扣血
                        spawnExplosion(t.x + t.w / 2, t.y + t.h / 2, 4, '#ff0080');
                    } else {
                        // 身体：扣节血量
                        const dmg = isRadarBurst ? 2 : 1;
                        const segDead = t.seg.hit(dmg);
                        spawnExplosion(t.x + t.w / 2, t.y + t.h / 2, segDead ? 15 : 3, '#ff6600');
                        if (segDead) {
                            score += t.seg.maxHp * 5;
                            addPressure(10);
                        }
                    }
                    hit = true;
                    break;
                }
            }
        }

        if (hit) playerBullets.splice(bi, 1);
    }

    // 敌方子弹 vs 玩家
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        if (circleRect(b.x, b.y, b.r, player.x + 6, player.y + 6, player.w - 12, player.h - 12)) {
            player.hit(10);
            spawnExplosion(b.x, b.y, 5, '#ff4444');
            enemyBullets.splice(i, 1);
        }
    }

    // 敌机 vs 玩家（体积碰撞）
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (rectsOverlap(player.x + 6, player.y + 6, player.w - 12, player.h - 12, e.x, e.y, e.w, e.h)) {
            player.hit(20);
            spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 15, '#ff6600');
            enemies.splice(i, 1);
        }
    }

    // 蛇形Boss vs 玩家
    if (snakeBoss && snakeBoss.alive) {
        for (const t of snakeBoss.getHitTargets()) {
            if (rectsOverlap(player.x + 6, player.y + 6, player.w - 12, player.h - 12, t.x, t.y, t.w, t.h)) {
                player.hit(15);
                spawnExplosion(t.x + t.w / 2, t.y + t.h / 2, 10, '#ff0080');
                break;
            }
        }
    }

    // 清理出界敌机
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].y > H + 60) enemies.splice(i, 1);
    }

    // 波次推进：普通敌机清空 且 没有待生成队列 且 蛇Boss不存在或已死
    const snakeDone = !snakeBoss || !snakeBoss.alive;
    if (enemies.length === 0 && waveSpawnQueue.length === 0 && snakeDone) {
        snakeBoss = null;
        spawnWave();
    }

    updateRadarPressure();

    // 更新 UI 元素
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('health').textContent = `HP: ${player.hp}`;
    document.getElementById('radarPressure').textContent = `雷压: ${Math.floor(radarPressure)}%`;
}

function render() {
    drawBackground();
    updateDrawExplosions();
    for (const e of enemies) e.draw();
    if (snakeBoss && snakeBoss.alive) snakeBoss.draw();
    drawEnemyBullets();
    drawPlayerBullets();
    player.draw();
    drawHUD();

    if (gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff0080';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff0080';
        ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', W / 2, H / 2 - 60);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#00ffff';
        ctx.font = '24px Arial';
        ctx.fillText(`得分: ${score}`, W / 2, H / 2);
        ctx.fillText(`波次: ${wave}`, W / 2, H / 2 + 36);
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText('点击屏幕重新开始', W / 2, H / 2 + 80);

        document.getElementById('gameOver').style.display = 'none'; // 用 canvas 自绘
    }
}

canvas.addEventListener('click', () => {
    if (gameOver) location.reload();
});

// ---------- 启动 ----------
spawnWave();

function loop() {
    update();
    render();
    requestAnimationFrame(loop);
}
loop();
