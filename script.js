/* === KONFIGURASJON OG VARIABLER === */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Spilltilstand
let gameState = {
    gold: 150,
    lives: 20,
    wave: 1,
    xp: 0,
    gameActive: false,
    enemies: [],
    towers: [],
    projectiles: [],
    mathDifficulty: 1, // 1-5
    mathHistory: [], // Lagrer resultat av siste 10 oppgaver (true/false)
    unlockedTowers: { basic: true, ice: false, sniper: false },
    selectedTower: 'basic'
};

// Kartsystem (20x15 ruter, hver rute 40x40px)
const TILE_SIZE = 40;
const ROWS = 15;
const COLS = 20;

// 0 = Gress (Byggbar), 1 = Sti (Fiender)
// En enkel S-formet sti
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

// Generer veipunkter (waypoints) for fiender basert på grid
// (Forenklet: hardkodet sti-koordinater basert på grid ovenfor for demo)
const waypoints = [
    {x:0, y:1}, {x:4, y:1}, {x:4, y:4}, {x:8, y:4}, {x:8, y:2}, {x:14, y:2},
    {x:14, y:4}, {x:17, y:4}, {x:17, y:9}, {x:10, y:9}, {x:10, y:7}, {x:2, y:7},
    {x:2, y:11}, {x:5, y:11}, {x:5, y:13}, {x:15, y:13}, {x:19, y:13}
].map(p => ({ x: p.x * TILE_SIZE + TILE_SIZE/2, y: p.y * TILE_SIZE + TILE_SIZE/2 }));

// Tårn definisjoner
const towerTypes = {
    basic: { name: 'Basis', cost: 50, range: 100, damage: 20, color: 'orange', cooldown: 30, speed: 5 },
    ice: { name: 'Brøk-Is', cost: 100, range: 120, damage: 5, color: 'cyan', cooldown: 40, speed: 4, effect: 'slow' },
    sniper: { name: 'Algebra', cost: 200, range: 300, damage: 100, color: 'red', cooldown: 100, speed: 10 }
};

/* === KLASSER === */

class Enemy {
    constructor(waveMultiplier) {
        this.x = waypoints[0].x;
        this.y = waypoints[0].y;
        this.wpIndex = 0;
        this.speed = 2;
        this.maxHp = 50 * waveMultiplier;
        this.hp = this.maxHp;
        this.radius = 10;
        this.frozen = 0; // Tidtaker for slow-effekt
    }

    update() {
        // Håndter slow effekt
        let currentSpeed = this.speed;
        if (this.frozen > 0) {
            currentSpeed = this.speed * 0.5;
            this.frozen--;
        }

        // Flytt mot neste waypoint
        let target = waypoints[this.wpIndex + 1];
        if (!target) return true; // Nådde slutten

        let dx = target.x - this.x;
        let dy = target.y - this.y;
        let dist = Math.hypot(dx, dy);

        if (dist < currentSpeed) {
            this.x = target.x;
            this.y = target.y;
            this.wpIndex++;
            if (this.wpIndex >= waypoints.length - 1) return true; // Ferdig
        } else {
            this.x += (dx / dist) * currentSpeed;
            this.y += (dy / dist) * currentSpeed;
        }
        return false;
    }

    draw() {
        ctx.fillStyle = this.frozen > 0 ? '#aaf' : '#a0a';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Helsebar
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - 10, this.y - 15, 20, 4);
        ctx.fillStyle = 'lime';
        ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp / this.maxHp), 4);
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
        // Enkelt: Finn nærmeste fiende
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
        ctx.fillStyle = this.props.color;
        ctx.fillRect(this.c * TILE_SIZE + 5, this.r * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        
        // Tegn rekkevidde hvis musa er over (kan implementeres senere)
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
            // Treff
            this.target.hp -= this.damage;
            if (this.effect === 'slow') this.target.frozen = 60; // 1 sekund slow
            this.active = false;
            
            // Sjekk om fiende dør
            if (this.target.hp <= 0) {
                gameState.gold += 10;
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
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

/* === MATEMATIKK LOGIKK === */

let currentMathProblem = {};
let pendingTowerLocation = null; // Lagrer hvor spilleren prøvde å bygge

function generateMathProblem() {
    // Juster vanskelighet basert på historikk
    const correctLast10 = gameState.mathHistory.slice(-10).filter(r => r).length;
    if (gameState.mathHistory.length >= 5) {
        if (correctLast10 / gameState.mathHistory.length > 0.8) gameState.mathDifficulty = Math.min(3, gameState.mathDifficulty + 1);
        else if (correctLast10 / gameState.mathHistory.length < 0.4) gameState.mathDifficulty = Math.max(1, gameState.mathDifficulty - 1);
    }
    document.getElementById('math-diff').innerText = gameState.mathDifficulty;

    let a, b, op, ans, text;

    switch(gameState.mathDifficulty) {
        case 1: // Enkel addisjon/subtraksjon
            a = Math.floor(Math.random() * 10) + 1;
            b = Math.floor(Math.random() * 10) + 1;
            op = Math.random() > 0.5 ? '+' : '-';
            if (op === '-' && a < b) [a, b] = [b, a]; // Unngå negative tall
            ans = op === '+' ? a + b : a - b;
            text = `${a} ${op} ${b} = ?`;
            break;
        case 2: // Multiplikasjon eller større addisjon
            if (Math.random() > 0.5) {
                a = Math.floor(Math.random() * 9) + 2;
                b = Math.floor(Math.random() * 9) + 2;
                op = 'x';
                ans = a * b;
            } else {
                a = Math.floor(Math.random() * 50) + 10;
                b = Math.floor(Math.random() * 50) + 10;
                op = '+';
                ans = a + b;
            }
            text = `${a} ${op} ${b} = ?`;
            break;
        case 3: // Enkel Algebra: 2x + 4 = 10
            let x = Math.floor(Math.random() * 10) + 1;
            let m = Math.floor(Math.random() * 5) + 2;
            let c = Math.floor(Math.random() * 10) + 1;
            let res = (m * x) + c;
            text = `${m}x + ${c} = ${res}, finn x`;
            ans = x;
            break;
    }

    currentMathProblem = { answer: ans };
    document.getElementById('math-problem').innerText = text;
    document.getElementById('math-answer').value = '';
    document.getElementById('math-feedback').innerText = '';
    
    // Vis modal
    document.getElementById('math-modal').classList.remove('hidden');
}

function checkAnswer() {
    const playerAns = parseInt(document.getElementById('math-answer').value);
    const feedback = document.getElementById('math-feedback');
    
    if (playerAns === currentMathProblem.answer) {
        feedback.style.color = 'lime';
        feedback.innerText = "Riktig!";
        gameState.mathHistory.push(true);
        gameState.xp += 10; // Bonus XP for matte
        
        setTimeout(() => {
            document.getElementById('math-modal').classList.add('hidden');
            buildTower(pendingTowerLocation.c, pendingTowerLocation.r);
        }, 800);
    } else {
        feedback.style.color = 'red';
        feedback.innerText = "Feil, prøv igjen!";
        gameState.mathHistory.push(false);
        pendingTowerLocation = null; // Avbryt bygging
        setTimeout(() => {
            document.getElementById('math-modal').classList.add('hidden');
        }, 1000);
    }
    updateUI();
}

/* === SPILLKONTROLL === */

function init() {
    canvas.addEventListener('click', handleCanvasClick);
    gameLoop();
}

function selectTowerType(type) {
    if (!gameState.unlockedTowers[type]) return; // Låst
    gameState.selectedTower = type;
    
    // UI oppdatering
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('btn-' + type).classList.add('selected');
}

function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);

    // Sjekk om vi kan bygge her
    if (mapGrid[r][c] === 1) return; // Sti
    if (gameState.towers.some(t => t.c === c && t.r === r)) return; // Opptatt

    const cost = towerTypes[gameState.selectedTower].cost;
    if (gameState.gold < cost) {
        alert("Ikke nok gull!");
        return;
    }

    // Start matte-prosess
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
    if (gameState.enemies.length > 0) return; // Bølge pågår
    
    gameState.wave++;
    let count = 5 + Math.floor(gameState.wave * 1.5);
    
    let spawned = 0;
    let spawnInterval = setInterval(() => {
        gameState.enemies.push(new Enemy(gameState.wave));
        spawned++;
        if (spawned >= count) clearInterval(spawnInterval);
    }, 1000);
    
    updateUI();
}

function updateUI() {
    document.getElementById('gold').innerText = gameState.gold;
    document.getElementById('lives').innerText = gameState.lives;
    document.getElementById('xp').innerText = gameState.xp;
    document.getElementById('skill-xp').innerText = gameState.xp;
    document.getElementById('wave').innerText = gameState.wave;
}

/* === FERDIGHETSTRE === */

function toggleSkillTree() {
    const modal = document.getElementById('skill-modal');
    modal.classList.toggle('hidden');
    updateUI();
}

function unlockSkill(type, cost) {
    if (gameState.xp >= cost && !gameState.unlockedTowers[type]) {
        gameState.xp -= cost;
        gameState.unlockedTowers[type] = true;
        
        // Oppdater UI
        document.getElementById('btn-' + type).classList.remove('locked');
        document.getElementById('node-' + type).innerHTML += "<br><b>LÅST OPP!</b>";
        updateUI();
    } else if (gameState.unlockedTowers[type]) {
        alert("Allerede låst opp!");
    } else {
        alert("Ikke nok XP!");
    }
}

/* === HOVEDLØKKE === */

function drawMap() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (mapGrid[r][c] === 1) {
                ctx.fillStyle = '#765'; // Sti-farge
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else {
                // Tegn rutenett
                ctx.strokeStyle = '#6a9e55';
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawMap();

    // Oppdater og tegn tårn
    gameState.towers.forEach(t => {
        t.update();
        t.draw();
    });

    // Oppdater og tegn fiender
    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        let e = gameState.enemies[i];
        if (e.update()) {
            // Nådde slutten
            gameState.lives--;
            gameState.enemies.splice(i, 1);
            if (gameState.lives <= 0) alert("Game Over!");
        } else if (e.hp <= 0) {
            // Død (håndtert i prosjektil)
            gameState.enemies.splice(i, 1);
        } else {
            e.draw();
        }
    }

    // Oppdater og tegn prosjektiler
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        let p = gameState.projectiles[i];
        p.update();
        if (!p.active) gameState.projectiles.splice(i, 1);
        else p.draw();
    }

    updateUI();
    requestAnimationFrame(gameLoop);
}

// Start
init();
