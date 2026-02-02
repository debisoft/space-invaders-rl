class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.scoreEl = document.getElementById('scoreEl');
        this.finalScoreEl = document.getElementById('finalScoreEl');
        this.startScreen = document.getElementById('startScreen');
        this.gameOverScreen = document.getElementById('gameOverScreen');

        // Game State
        this.width = 800;
        this.height = 600;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.score = 0;
        this.isGameOver = false;
        this.isPlaying = false;

        // Entities
        this.player = null;
        this.invaders = [];
        this.boss = null;
        this.bullets = [];
        this.particles = [];

        // Input
        this.keys = {
            ArrowLeft: false,
            ArrowRight: false,
            Space: false
        };

        this.setupInputs();
        this.gameLoop = this.gameLoop.bind(this);
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'ArrowLeft') this.keys.ArrowLeft = true;
            if (e.code === 'ArrowRight') this.keys.ArrowRight = true;
            console.log('Key pressed:', e.code);
            if (e.code === 'Space') {
                e.preventDefault();
                console.log('Space detected. Playing:', this.isPlaying, 'GameOver:', this.isGameOver);
                if (!this.isPlaying && !this.isGameOver) {
                    console.log('Starting game...');
                    this.start();
                } else if (this.isGameOver) {
                    console.log('Restarting game...');
                    this.restart();
                }
                this.keys.Space = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowLeft') this.keys.ArrowLeft = false;
            if (e.code === 'ArrowRight') this.keys.ArrowRight = false;
            if (e.code === 'Space') this.keys.Space = false;
        });
    }

    start() {
        this.reset();
        this.gameLoop();
    }

    reset() {
        this.isPlaying = true;
        this.isGameOver = false;
        this.score = 0;
        this.scoreEl.innerText = this.score;
        this.startScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');

        // Initialize entities
        this.player = new Player(this);
        this.invaders = [];
        this.boss = null;
        this.bullets = [];
        this.particles = [];
        this.stars = [];

        // Create Stars
        for (let i = 0; i < 50; i++) {
            this.stars.push(new Star(this));
        }

        this.setupInvaders();
        return this.getState();
    }

    // RL Environment Interface
    getState() {
        if (!this.player) return new Array(5).fill(0);

        // Feature vector: [PlayerX, ClosestInvaderX, ClosestInvaderY, ClosestBulletX, ClosestBulletY]
        // Normalized to 0-1

        let pX = this.player.x / this.width;

        // Closest Invader
        let closestInvader = null;
        let minDist = Infinity;
        this.invaders.forEach(inv => {
            let d = Math.abs(inv.x - this.player.x) + Math.abs(inv.y - this.player.y);
            if (d < minDist) {
                minDist = d;
                closestInvader = inv;
            }
        });

        let iX = closestInvader ? closestInvader.x / this.width : 0.5;
        let iY = closestInvader ? closestInvader.y / this.height : 0;

        // Closest Enemy Bullet
        let closestBullet = null;
        minDist = Infinity;
        this.bullets.forEach(b => {
            if (b.isEnemy) {
                let d = Math.abs(b.x - this.player.x) + Math.abs(b.y - this.player.y);
                if (d < minDist) {
                    minDist = d;
                    closestBullet = b;
                }
            }
        });

        let bX = closestBullet ? closestBullet.x / this.width : 0.5;
        let bY = closestBullet ? closestBullet.y / this.height : 0;



        // Boss Feature (Simplified: presence and X pos)
        let bossX = this.boss ? this.boss.x / this.width : 0.5;
        let bossActive = this.boss ? 1.0 : 0.0;

        return [pX, iX, iY, bX, bY, bossX, bossActive];
    }

    step(action) {
        // Action: 0=Stay, 1=Left, 2=Right, 3=Shoot
        if (action === 1) this.keys.ArrowLeft = true; else this.keys.ArrowLeft = false;
        if (action === 2) this.keys.ArrowRight = true; else this.keys.ArrowRight = false;
        if (action === 3) this.keys.Space = true; else this.keys.Space = false;

        let prevScore = this.score;
        this.update();
        if (this.aiEnabled) this.draw(); // Only draw if needed, or always draw

        let reward = 0;
        // Reward for survival
        reward += 0.1;

        // Reward for score increase
        if (this.score > prevScore) {
            reward += 10;
        }

        // Penalty for game over
        if (this.isGameOver) {
            reward -= 50;
        }

        return {
            state: this.getState(),
            reward: reward,
            done: this.isGameOver
        };
    }

    restart() {
        this.start();
    }

    gameOver() {
        this.isPlaying = false;
        this.isGameOver = true;
        this.finalScoreEl.innerText = this.score;
        this.gameOverScreen.classList.remove('hidden');
    }

    setupInvaders() {
        const rows = 5;
        const cols = 8;
        const invaderPixelSize = 3;
        const invaderRawWidth = 11; // from sprite
        const invaderRawHeight = 8; // from sprite
        const invaderWidth = invaderRawWidth * invaderPixelSize;
        const invaderHeight = invaderRawHeight * invaderPixelSize;
        const padding = 20;
        const offsetLeft = (this.width - (cols * (invaderWidth + padding))) / 2;
        const offsetTop = 80;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this.invaders.push(new Invader(this,
                    offsetLeft + c * (invaderWidth + padding),
                    offsetTop + r * (invaderHeight + padding),
                    invaderPixelSize
                ));
            }
        }
    }

    update() {
        if (!this.isPlaying) return;

        // Update Stars
        this.stars.forEach(star => star.update());

        // Update Player
        if (this.player && !this.player.markedForDeletion) {
            this.player.update();
        }

        // --- Boss Logic ---
        if (this.boss) {
            this.boss.update();
            if (this.boss.markedForDeletion) {
                this.boss = null;
                // Boss Defeated Reward
                this.score += 500;
                this.scoreEl.innerText = this.score;
                // Respawn Invaders for next loop
                this.setupInvaders();
            }
        } else if (this.invaders.length === 0) {
            // Spawn Boss if no invaders
            this.boss = new Boss(this);
        }

        // Enemy Shooting Logic
        if (this.invaders.length > 0 && Math.random() < 0.02) {
            const randomInvader = this.invaders[Math.floor(Math.random() * this.invaders.length)];
            this.bullets.push(new Bullet(this, randomInvader.x + randomInvader.width / 2, randomInvader.y + randomInvader.height, 5, true));
        }

        // Update Bullets
        this.bullets.forEach((bullet, index) => {
            bullet.update();
            if (bullet.markedForDeletion) {
                this.bullets.splice(index, 1);
            }
        });

        // Update Particles
        this.particles.forEach((particle, index) => {
            particle.update();
            if (particle.markedForDeletion) {
                this.particles.splice(index, 1);
            }
        });

        // Update Invaders
        let moveDown = false;
        this.invaders.forEach(invader => {
            invader.update();
            if (invader.x + invader.width >= this.width || invader.x <= 0) {
                moveDown = true;
            }
        });

        if (moveDown) {
            this.invaders.forEach(invader => {
                invader.vx *= -1;
                invader.y += invader.height;
            });
        }

        // Collision Detection
        this.bullets.forEach(bullet => {
            if (!bullet.isEnemy) {
                this.invaders.forEach((invader, invIndex) => {
                    if (this.checkCollision(bullet, invader)) {
                        bullet.markedForDeletion = true;
                        this.invaders.splice(invIndex, 1);
                        this.score += 10;
                        this.scoreEl.innerText = this.score;
                        this.createExplosion(invader.x + invader.width / 2, invader.y + invader.height / 2, invader.color);
                    }
                });

                // Check collision with Boss
                if (this.boss && !this.boss.markedForDeletion) {
                    if (this.checkCollision(bullet, this.boss)) {
                        bullet.markedForDeletion = true;
                        this.boss.health--;
                        this.createExplosion(bullet.x, bullet.y, '#ffffff'); // Small hit effect
                        if (this.boss.health <= 0) {
                            this.boss.markedForDeletion = true;
                            this.createExplosion(this.boss.x + this.boss.width / 2, this.boss.y + this.boss.height / 2, this.boss.color);
                            // Massive explosion
                            for (let i = 0; i < 5; i++) {
                                setTimeout(() => {
                                    this.createExplosion(
                                        this.boss.x + Math.random() * this.boss.width,
                                        this.boss.y + Math.random() * this.boss.height,
                                        this.boss.color
                                    );
                                }, i * 100);
                            }
                        }
                    }
                }
            } else {
                if (this.player && !this.player.markedForDeletion && this.checkCollision(bullet, this.player)) {
                    bullet.markedForDeletion = true;
                    this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, this.player.color);
                    this.player.markedForDeletion = true;
                    this.gameOver();
                }
            }
        });

        this.invaders.forEach(invader => {
            if (this.player && !this.player.markedForDeletion && this.checkCollision(invader, this.player)) {
                this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, this.player.color);
                this.player.markedForDeletion = true;
                this.gameOver();
            }
            if (invader.y + invader.height >= this.height) {
                this.gameOver();
            }
        });

        if (this.boss && this.player && !this.player.markedForDeletion && this.checkCollision(this.boss, this.player)) {
            this.player.markedForDeletion = true;
            this.gameOver();
        }

        // Removed auto-respawn loop here, handled by Boss logic
        /*
        if (this.invaders.length === 0) {
            this.setupInvaders();
        }
        */
    }

    createExplosion(x, y, color) {
        for (let i = 0; i < 15; i++) {
            this.particles.push(new Particle(this, x, y, color));
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.stars.forEach(star => star.draw(this.ctx));

        if (this.player && !this.player.markedForDeletion) this.player.draw(this.ctx);

        if (this.boss) this.boss.draw(this.ctx);

        this.invaders.forEach(invader => invader.draw(this.ctx));
        this.bullets.forEach(bullet => bullet.draw(this.ctx));
        this.particles.forEach(particle => particle.draw(this.ctx));
    }

    checkCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    }

    gameLoop() {
        if (!this.aiEnabled && this.isPlaying) {
            this.update();
            this.draw();
            requestAnimationFrame(this.gameLoop);
        }
    }
}

class Player {
    constructor(game) {
        this.game = game;
        this.pixelSize = 4;
        this.sprite = [
            "   1   ",
            "  111  ",
            " 11111 ",
            "1111111",
            "11   11",
            "1     1"
        ];
        this.width = this.sprite[0].length * this.pixelSize;
        this.height = this.sprite.length * this.pixelSize;

        this.x = game.width / 2 - this.width / 2;
        this.y = game.height - this.height - 20;
        this.speed = 5;
        this.color = '#39ff14';
        this.shootTimer = 0;
        this.shootInterval = 20;
    }

    update() {
        if (this.game.keys.ArrowLeft) this.x -= this.speed;
        if (this.game.keys.ArrowRight) this.x += this.speed;

        if (this.x < 0) this.x = 0;
        if (this.x > this.game.width - this.width) this.x = this.game.width - this.width;

        if (this.shootTimer > 0) this.shootTimer--;
        if (this.game.keys.Space && this.shootTimer === 0) {
            this.game.bullets.push(new Bullet(this.game, this.x + this.width / 2 - 2, this.y, -7, false));
            this.shootTimer = this.shootInterval;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        for (let r = 0; r < this.sprite.length; r++) {
            for (let c = 0; c < this.sprite[r].length; c++) {
                if (this.sprite[r][c] === '1') {
                    ctx.fillRect(this.x + c * this.pixelSize, this.y + r * this.pixelSize, this.pixelSize, this.pixelSize);
                }
            }
        }
    }
}

class Invader {
    constructor(game, x, y, pixelSize) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.pixelSize = pixelSize;
        this.sprite1 = [
            "  1     1  ",
            "   1   1   ",
            "  1111111  ",
            " 11 111 11 ",
            "11111111111",
            "1 1111111 1",
            "1 1     1 1",
            "   11 11   "
        ];
        this.sprite2 = [
            "  1     1  ",
            "1  1   1  1",
            "1 1111111 1",
            "111 111 111",
            "11111111111",
            " 111111111 ",
            "  1     1  ",
            " 1       1 "
        ];
        this.width = this.sprite1[0].length * this.pixelSize;
        this.height = this.sprite1.length * this.pixelSize;
        this.color = '#ff00ff';
        this.vx = 2;
        this.frameTimer = 0;
        this.frameInterval = 30;
        this.frame = 0;
    }

    update() {
        this.x += this.vx;
        this.frameTimer++;
        if (this.frameTimer >= this.frameInterval) {
            this.frame = this.frame === 0 ? 1 : 0;
            this.frameTimer = 0;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        const sprite = this.frame === 0 ? this.sprite1 : this.sprite2;

        for (let r = 0; r < sprite.length; r++) {
            for (let c = 0; c < sprite[r].length; c++) {
                if (sprite[r][c] !== ' ') {
                    ctx.fillRect(this.x + c * this.pixelSize, this.y + r * this.pixelSize, this.pixelSize, this.pixelSize);
                }
            }
        }
    }
}

class Star {
    constructor(game) {
        this.game = game;
        this.x = Math.random() * game.width;
        this.y = Math.random() * game.height;
        this.size = Math.random() * 2;
        this.speed = Math.random() * 0.5 + 0.1;
        this.brightness = Math.random();
    }

    update() {
        this.y += this.speed;
        if (this.y > this.game.height) {
            this.y = 0;
            this.x = Math.random() * this.game.width;
        }
        // Twinkle
        this.brightness += Math.random() * 0.1 - 0.05;
        if (this.brightness > 1) this.brightness = 1;
        if (this.brightness < 0.3) this.brightness = 0.3;
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.brightness})`;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}

class Bullet {
    constructor(game, x, y, speed, isEnemy) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 10;
        this.speed = speed;
        this.isEnemy = isEnemy;
        this.markedForDeletion = false;
        this.color = isEnemy ? '#ff0000' : '#00ffff';
    }

    update() {
        this.y += this.speed;
        if (this.y < 0 || this.y > this.game.height) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

class Particle {
    constructor(game, x, y, color) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 1;
        this.speedX = Math.random() * 6 - 3;
        this.speedY = Math.random() * 6 - 3;
        this.markedForDeletion = false;
        this.life = 100; // frames
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life--;
        this.size *= 0.95;
        if (this.life <= 0 || this.size < 0.2) this.markedForDeletion = true;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}


class Boss {
    constructor(game) {
        this.game = game;
        this.width = 60; // Approximate
        this.height = 40;
        this.x = game.width / 2 - this.width / 2;
        this.y = 50;
        this.speedX = 3;
        this.health = 20;
        this.maxHealth = 20;
        this.color = '#ff0000';
        this.markedForDeletion = false;
        this.pixelSize = 4;

        // Sprite: A simplified saucer shape
        this.sprite = [
            "      11111      ",
            "    111111111    ",
            "  1111111111111  ",
            " 11 111111111 11 ",
            "11111111111111111",
            "1   111111111   1",
            "     111 111     "
        ];
        this.width = this.sprite[0].length * this.pixelSize;
        this.height = this.sprite.length * this.pixelSize;

        this.angle = 0; // For sine wave motion
    }

    update() {
        // Sine wave movement
        this.x += this.speedX;
        this.angle += 0.05;
        this.y = 50 + Math.sin(this.angle) * 30;

        // Bounce off walls
        if (this.x <= 0 || this.x + this.width >= this.game.width) {
            this.speedX *= -1;
        }

        // Shooting logic (Spread shot)
        if (Math.random() < 0.03) {
            // Center shot
            this.game.bullets.push(new Bullet(this.game, this.x + this.width / 2, this.y + this.height, 5, true));
            // Angled shots (Creating a spread effect by slightly offsetting X velocity would be better, but Bullet class only supports Y speed currently. 
            // We will stick to simple multiple parallel shots for now to avoid refactoring Bullet too much)
            this.game.bullets.push(new Bullet(this.game, this.x + this.width / 2 - 20, this.y + this.height - 5, 5, true));
            this.game.bullets.push(new Bullet(this.game, this.x + this.width / 2 + 20, this.y + this.height - 5, 5, true));
        }
    }

    draw(ctx) {
        // Draw Sprite
        ctx.fillStyle = this.color;
        // Flash white on hit could be added here

        for (let r = 0; r < this.sprite.length; r++) {
            for (let c = 0; c < this.sprite[r].length; c++) {
                if (this.sprite[r][c] === '1') {
                    ctx.fillRect(this.x + c * this.pixelSize, this.y + r * this.pixelSize, this.pixelSize, this.pixelSize);
                }
            }
        }

        // Draw Health Bar
        const barWidth = this.width;
        const barHeight = 5;
        const barX = this.x;
        const barY = this.y - 15;

        ctx.fillStyle = '#555';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        const hpPercent = this.health / this.maxHealth;
        ctx.fillStyle = hpPercent > 0.5 ? '#00ff00' : '#ff0000';
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    }
}

// Start game
window.game = new Game();
