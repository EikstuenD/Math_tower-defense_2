/* === KONFIGURASJON === */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = {
    gold: 150,
    lives: 20,
    wave: 1,
    xp: 0,
    waveActive: false, // Styrer om vi er i kamp eller byggemodus
    gameSpeed: 1,      // 1x eller 3x
    enemies: [],
    towers: [],
    projectiles: [],
    mathDifficulty: 1,
    mathHistory: [],
    // Sniper (Algebra) er nå åpen fra start
    unlockedTowers: { basic: true, ice: false, sniper: true },
    selectedTower: 'basic'
};

const TILE_SIZE = 40;
const ROWS = 15;
const COLS = 20;

// Kart: 0 = Gress, 1 = Sti
const mapGrid = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,0,0,0,0,0,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,0,0],
    [0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0],
    [0,0,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];

const waypoints = [
    {x:0, y:1}, {x:4, y:1}, {x:4, y:4}, {x:8, y:4}, {x:8, y:2}, {x:14, y:2},
    {x:14, y:4}, {x:17, y:4}, {x:17, y:9}, {x:10, y:9}, {x:10, y:7}, {x:2, y:7},
    {x:2, y:11}, {x:5, y:11}, {x:5, y:13}, {x:15, y:13}, {x:19, y:13}
].map(p => ({ x: p.x * TILE_SIZE + TILE_SIZE/2, y: p.y * TILE_SIZE + TILE_SIZE/2 }));

// Tårn definisjoner
const towerTypes = {
    basic: { name: 'Basis', cost: 50, range: 100, damage: 20, color: 'orange', cooldown: 30, speed: 5 },
    ice: { name: 'Brøk-Is', cost: 100, range: 120, damage: 5, color: 'cyan', cooldown: 40, speed: 4, effect: 'slow' },
    sniper: { name: 'Algebra', cost: 150, range: 300, damage: 120, color: '#e74c3c', cooldown: 90, speed: 12 }
};

// Monster Emojis basert på bølge
const monsterSkins = ['🦠', '🐛', '🕷️', '🦂', '🐍', '🦇', '👹', '👺', '🐲', '💀'];

/* === KLASSER === */

class Enemy {
    constructor(wave) {
        this.x = waypoints[0].x;
        this.y = waypoints[0].y;
        this.wpIndex = 0;
        this.speed = 1.5 + (wave * 0.1); // Litt raskere per bølge
        this.maxHp = 40 + (wave * 30);
        this.hp = this.maxHp;
        this.frozen = 0;
        
        // Velg utseende
        let skinIndex = Math.min(wave - 1, monsterSkins.length - 1);
        this.skin = monsterSkins[skinIndex];
    }

    update() {
        let currentSpeed = this.speed;
        if (this.frozen > 0) {
            currentSpeed *= 0.5;
            this.frozen--;
        }

        let target = waypoints[this.wpIndex + 1];
        if (!target) return true;

        let dx = target.x - this.x;
        let dy = target.y - this.y;
        let dist = Math.hypot(dx, dy);

        if (dist < currentSpeed) {
            this.x = target.x;
            this.y = target.y;
            this.wpIndex++;
            if (this.wpIndex >= waypoints.length - 1) return true;
        } else {
            this.x += (dx / dist) * currentSpeed;
            this.y += (dy / dist) * currentSpeed;
        }
        return false;
    }

    draw() {
        // Tegn emoji sentrert
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.skin, this.x, this.y);

        // Helsebar
        const barWidth = 24;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - barWidth/2, this.y - 18, barWidth, 4);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - barWidth/2, this.y - 18, barWidth * (Math.max(0, this.hp) / this.maxHp), 4);
        
        if(this.frozen > 0) {
            ctx.fillStyle = "rgba(0, 255, 255, 0.3)";
            ctx.beginPath(); ctx.arc(this.x, this.y, 15, 0, Math.PI*2); ctx.fill();
        }
    }
}

class Tower {
    constructor(c, r, type) {
        this.c = c;
        this.r = r;
        this.x = c * TILE_SIZE + TILE_SIZE / 2;
        this.y = r * TILE_SIZE + TILE_SIZE / 2;
        this.type = type;
        this.props = towerTypes[type];
        this.cooldownTimer = 0;
    }

    update() {
        if (this.cooldownTimer > 0) this.cooldownTimer--;

        if (this.cooldownTimer <= 0) {
            const target = this.findTarget();
            if (target) {
                this.shoot(target);
                this.cooldownTimer = this.props.cooldown;
            }
        }
    }

    findTarget() {
        let nearest = null;
        let minDist = Infinity;
        gameState.enemies.forEach(enemy => {
            let dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist <= this.props.range && dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        });
        return nearest;
    }

    shoot(target) {
        gameState.projectiles.push(new Projectile(this.x, this.y, target, this.props));
    }

    draw() {
        // Tårn base
        ctx.fillStyle = this.props.color;
        const pad = 4;
        ctx.fillRect(this.c * TILE_SIZE + pad, this.r * TILE_SIZE + pad, TILE_SIZE - pad*2, TILE_SIZE - pad*2);
        
        // Tårn detalj
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(this.c * TILE_SIZE + 10, this.r * TILE_SIZE + 10, TILE_SIZE - 20, TILE_SIZE - 20);
    }
}

class Projectile {
    constructor(x, y, target, props) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = props.damage;
        this.speed = props.speed;
        this.effect = props.effect;
        this.active = true;
    }

    update() {
        if (!this.target || this.target.hp <= 0) {
            this.active = false;
            return;
        }

        let dx = this.target.x - this.x;
        let dy = this.target.y - this.y;
        let dist = Math.hypot(dx, dy);

        if (dist < this.speed) {
            this.target.hp -= this.damage;
            if (this.effect === 'slow') this.target.frozen = 90;
            this.active = false;
            
            if (this.target.hp <= 0) {
                gameState.gold += 15 + gameState.wave;
                gameState.xp += 5;
                updateUI();
            }
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    draw() {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

/* === MATTE & UI === */

let currentMathProblem = {};
let pendingTowerLocation = null;

function generateMathProblem() {
    const correctLast10 = gameState.mathHistory.slice(-10).filter(r => r).length;
    if (gameState.mathHistory.length >= 5) {
        if (correctLast10 / gameState.mathHistory.length > 0.8) gameState.mathDifficulty = Math.min(3, gameState.mathDifficulty + 1);
        else if (correctLast10 / gameState.mathHistory.length < 0.4) gameState.mathDifficulty = Math.max(1, gameState.mathDifficulty - 1);
    }
    document.getElementById('math-diff').innerText = gameState.mathDifficulty;

    let a, b, op, ans, text;
    // Enkel progresjon i matte
    switch(gameState.mathDifficulty) {
        case 1: 
            a = Math.floor(Math.random() * 10) + 2;
            b = Math.floor(Math.random() * 10) + 2;
            op = '+';
            ans = a + b;
            text = `${a} + ${b} = ?`;
            break;
        case 2:
            a = Math.floor(Math.random() * 10) + 2;
            b = Math.floor(Math.random() * 10) + 2;
            op = 'x';
            ans = a * b;
            text = `${a} x ${b} = ?`;
            break;
        case 3:
            let x = Math.floor(Math.random() * 8) + 2;
            let m = Math.floor(Math.random() * 4) + 2;
            let c = Math.floor(Math.random() * 10);
            let res = m * x + c;
            text = `${m}x + ${c} = ${res}, finn x`;
            ans = x;
            break;
    }

    currentMathProblem = { answer: ans };
    document.getElementById('math-problem').innerText = text;
    document.getElementById('math-answer').value = '';
    document.getElementById('math-feedback').innerText = '';
    document.getElementById('math-modal').classList.remove('hidden');
    document.getElementById('math-answer').focus();
}

function checkAnswer() {
    const playerAns = parseInt(document.getElementById('math-answer').value);
    const feedback = document.getElementById('math-feedback');
    
    if (playerAns === currentMathProblem.answer) {
        feedback.style.color = 'lime';
        feedback.innerText = "Riktig!";
        gameState.mathHistory.push(true);
        gameState.xp += 10;
        
        setTimeout(() => {
            document.getElementById('math-modal').classList.add('hidden');
            buildTower(pendingTowerLocation.c, pendingTowerLocation.r);
        }, 600);
    } else {
        feedback.style.color = 'red';
        feedback.innerText = "Feil! Tårnbygging avbrutt.";
        gameState.mathHistory.push(false);
        pendingTowerLocation = null;
        setTimeout(() => {
            document.getElementById('math-modal').classList.add('hidden');
        }, 1200);
    }
    updateUI();
}

/* === SPILLKONTROLL === */

function init() {
    canvas.addEventListener('click', handleCanvasClick);
    
    // Støtte for Enter-tast i matte-modal
    document.getElementById('math-answer').addEventListener("keypress", function(event) {
        if (event.key === "Enter") checkAnswer();
    });

    gameLoop();
}

function selectTowerType(type) {
    if (!gameState.unlockedTowers[type]) return;
    gameState.selectedTower = type;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('btn-' + type).classList.add('selected');
}

function handleCanvasClick(e) {
    // VIKTIG ENDRING: Kan ikke bygge mens bølgen er aktiv
    if (gameState.waveActive) {
        alert("⚠️ Kamp pågår! Du kan bare bygge tårn mellom bølgene.");
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);

    if (mapGrid[r][c] === 1 || gameState.towers.some(t => t.c === c && t.r === r)) return;

    const cost = towerTypes[gameState.selectedTower].cost;
    if (gameState.gold < cost) {
        alert("Ikke nok gull!");
        return;
    }

    pendingTowerLocation = { c, r };
    generateMathProblem();
}

function buildTower(c, r) {
    const cost = towerTypes[gameState.selectedTower].cost;
    gameState.gold -= cost;
    gameState.towers.push(new Tower(c, r, gameState.selectedTower));
    updateUI();
}

function startNextWave() {
    if (gameState.waveActive) return;
    
    gameState.waveActive = true;
    
    // Tilbakestill hastighet til 1x ved start av ny bølge (valgfritt, men trygt)
    gameState.gameSpeed = 1; 
    updateSpeedBtn();
    
    updateStatus("⚠️ KAMP PÅGÅR! (Bygging låst)");
    document.getElementById('startBtn').disabled = true;

    let count = 5 + Math.floor(gameState.wave * 1.5);
    let spawned = 0;
    
    let spawnInterval = setInterval(() => {
        gameState.enemies.push(new Enemy(gameState.wave));
        spawned++;
        if (spawned >= count) clearInterval(spawnInterval);
    }, 1000);
}

function toggleSpeed() {
    gameState.gameSpeed = gameState.gameSpeed === 1 ? 3 : 1;
    updateSpeedBtn();
}

function updateSpeedBtn() {
    const btn = document.getElementById('speedBtn');
    if(gameState.gameSpeed === 3) {
        btn.innerHTML = "⏩ 3x";
        btn.classList.add('active');
    } else {
        btn.innerHTML = "⏩ 1x";
        btn.classList.remove('active');
    }
}

function waveComplete() {
    gameState.waveActive = false;
    gameState.wave++;
    updateStatus("✅ Bølge fullført! Bygg nye tårn nå.");
    document.getElementById('startBtn').disabled = false;
    
    // Gullbonus for å fullføre bølge
    gameState.gold += 50; 
    updateUI();
}

function updateStatus(msg) {
    const el = document.getElementById('status-msg');
    el.innerText = msg;
    el.className = gameState.waveActive ? 'status-active' : 'status-waiting';
}

function updateUI() {
    document.getElementById('gold').innerText = gameState.gold;
    document.getElementById('lives').innerText = gameState.lives;
    document.getElementById('xp').innerText = gameState.xp;
    document.getElementById('skill-xp').innerText = gameState.xp;
    document.getElementById('wave').innerText = gameState.wave;
}

/* === SKILL TREE === */
function toggleSkillTree() {
    document.getElementById('skill-modal').classList.toggle('hidden');
}

function unlockSkill(type, cost) {
    if (gameState.xp >= cost && !gameState.unlockedTowers[type]) {
        gameState.xp -= cost;
        gameState.unlockedTowers[type] = true;
        document.getElementById('btn-' + type).classList.remove('locked');
        document.getElementById('node-' + type).innerHTML += "<br><b>LÅST OPP!</b>";
        updateUI();
    }
}

/* === MAIN LOOP === */
function drawMap() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (mapGrid[r][c] === 1) {
                ctx.fillStyle = '#4a3b2a';
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.strokeStyle = '#6a9e55';
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

function updateGameLogic() {
    gameState.towers.forEach(t => t.update());

    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        let e = gameState.enemies[i];
        if (e.update()) {
            gameState.lives--;
            gameState.enemies.splice(i, 1);
            if (gameState.lives <= 0) {
                alert("Game Over! Last inn siden på nytt for å prøve igjen.");
                gameState.waveActive = false;
            }
        }
    }
    // Sjekk om bølge er ferdig
    if (gameState.waveActive && gameState.enemies.length === 0 && gameState.lives > 0) {
        // Vent litt før vi sier "ferdig" så siste prosjektil treffer
        setTimeout(() => {
            if (gameState.enemies.length === 0 && gameState.waveActive) waveComplete();
        }, 1000);
    }

    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        let p = gameState.projectiles[i];
        p.update();
        if (!p.active) gameState.projectiles.splice(i, 1);
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();

    // Logikk-loop: Kjøres flere ganger hvis Speed er 3x
    const loops = gameState.gameSpeed;
    for(let i=0; i<loops; i++) {
        updateGameLogic();
    }

    // Tegning (kjøres bare én gang per frame)
    gameState.towers.forEach(t => t.draw());
    gameState.enemies.forEach(e => e.draw());
    gameState.projectiles.forEach(p => p.draw());

    requestAnimationFrame(gameLoop);
}

init();
