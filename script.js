AFRAME.registerComponent('mars-terrain', {
  schema: {
    width: {type: 'number', default: 1000},
    depth: {type: 'number', default: 1000},
    resolution: {type: 'number', default: 5},
    duneHeight: {type: 'number', default: 20},
    duneFrequency: {type: 'number', default: 0.001}
  },

  init: function () {
    this.noise = new SimplexNoise();
    this.generateTerrain();
  },

  generateTerrain: function () {
    const {width, depth, resolution, duneHeight, duneFrequency} = this.data;
    const vertices = [];
    const indices = [];
    const colors = [];

    for (let z = 0; z <= depth; z += resolution) {
      for (let x = 0; x <= width; x += resolution) {
        const duneNoise = this.noise.noise2D(x * duneFrequency, z * duneFrequency);
        const y = Math.pow(Math.abs(duneNoise), 2) * duneHeight;
        vertices.push(x - width / 2, y, z - depth / 2);

        // Add color variations
        const hue = 0.05 + Math.random() * 0.02; // Reddish hue
        const saturation = 0.6 + Math.random() * 0.2;
        const lightness = 0.2 + Math.random() * 0.1;
        const color = new THREE.Color().setHSL(hue, saturation, lightness);
        colors.push(color.r, color.g, color.b);
      }
    }

    for (let z = 0; z < depth / resolution; z++) {
      for (let x = 0; x < width / resolution; x++) {
        const tl = z * (width / resolution + 1) + x;
        const tr = tl + 1;
        const bl = (z + 1) * (width / resolution + 1) + x;
        const br = bl + 1;
        indices.push(tl, bl, tr);
        indices.push(tr, bl, br);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.2
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.el.setObject3D('mesh', mesh);

    // Add terrain collision
    this.el.setAttribute('ammo-shape', {
      type: 'heightfield',
      heightfieldData: vertices.filter((_, i) => i % 3 === 1),
      heightfieldDistance: resolution
    });
    this.el.setAttribute('ammo-body', {type: 'static'});
  }
});

AFRAME.registerComponent('player-movement', {
  schema: {
    speed: {type: 'number', default: 20}
  },

  init: function () {
    this.velocity = new THREE.Vector3();
    this.jumpVelocity = 5;
    this.gravity = -9.8 * 0.4;
    this.canJump = true;
    this.raycaster = new THREE.Raycaster();
    this.terrain = document.querySelector('[mars-terrain]').object3D;
    this.oxygen = 100;
    this.maxOxygen = 100;
    this.oxygenDepletion = 0.2;
    this.score = 0;
    this.tanksCollected = 0;
    this.speedBoosts = 0;
    this.speedBoostDuration = 60; // 60 seconds
    this.speedBoostTimer = 0;
    this.objectivesCompleted = 0;
    this.totalObjectives = 5;
    this.lastGroundedPosition = new THREE.Vector3();

    this.onKeyDown = this.onKeyDown.bind(this);
    document.addEventListener('keydown', this.onKeyDown);

    // Create HUD
    this.createHUD();

    this.setNewObjective();
  },

  createHUD: function () {
    this.hud = document.createElement('div');
    this.hud.style.position = 'absolute';
    this.hud.style.top = '10px';
    this.hud.style.left = '10px';
    this.hud.style.color = 'white';
    this.hud.style.fontFamily = 'Arial, sans-serif';
    this.hud.style.fontSize = '20px';
    document.body.appendChild(this.hud);

    this.positionDisplay = document.createElement('div');
    this.positionDisplay.style.position = 'absolute';
    this.positionDisplay.style.bottom = '10px';
    this.positionDisplay.style.left = '10px';
    this.positionDisplay.style.color = 'white';
    this.positionDisplay.style.fontFamily = 'Arial, sans-serif';
    this.positionDisplay.style.fontSize = '16px';
    document.body.appendChild(this.positionDisplay);

    this.objectiveDisplay = document.createElement('div');
    this.objectiveDisplay.style.position = 'absolute';
    this.objectiveDisplay.style.top = '10px';
    this.objectiveDisplay.style.right = '10px';
    this.objectiveDisplay.style.color = 'white';
    this.objectiveDisplay.style.fontFamily = 'Arial, sans-serif';
    this.objectiveDisplay.style.fontSize = '18px';
    document.body.appendChild(this.objectiveDisplay);
  },

  onKeyDown: function (event) {
    if (event.code === 'Space' && this.canJump) {
      this.jump();
    }
  },

  jump: function () {
    this.velocity.y = this.jumpVelocity;
    this.canJump = false;
  },

  tick: function (time, timeDelta) {
    const deltaSeconds = timeDelta / 1000;
    const position = this.el.object3D.position;

    // Update speed boost
    if (this.speedBoosts > 0) {
      this.speedBoostTimer += deltaSeconds;
      if (this.speedBoostTimer >= this.speedBoostDuration) {
        this.speedBoosts--;
        this.speedBoostTimer = 0;
      }
    }

    // Apply speed boost
    const currentSpeed = this.data.speed * (1 + this.speedBoosts * 0.5);
    this.el.setAttribute('wasd-controls', `acceleration: ${currentSpeed}`);

    // Apply gravity
    this.velocity.y += this.gravity * deltaSeconds;
    position.y += this.velocity.y * deltaSeconds;

    // Raycast to find terrain height
    this.raycaster.set(
      new THREE.Vector3(position.x, position.y + 100, position.z),
      new THREE.Vector3(0, -1, 0)
    );
    const intersects = this.raycaster.intersectObject(this.terrain, true);

    if (intersects.length > 0) {
      const terrainHeight = intersects[0].point.y;
      const playerHeight = 1.6;

      if (position.y < terrainHeight + playerHeight) {
        position.y = terrainHeight + playerHeight;
        this.velocity.y = 0;
        this.canJump = true;
        this.lastGroundedPosition.copy(position);
      }
    }

    // Deplete oxygen
    this.oxygen = Math.max(0, this.oxygen - this.oxygenDepletion * deltaSeconds);

    // Update HUD
    this.updateHUD(position);

    // Check for game over
    if (this.oxygen <= 0) {
      this.gameOver();
    }

    // Check for item collection
    this.checkItemCollection(position);

    // Check position-based objectives
    this.checkPositionObjectives(position);
  },

  updateHUD: function (position) {
    this.hud.innerHTML = `Oxygen: ${Math.round(this.oxygen)}%<br>Score: ${this.score}<br>Tanks Collected: ${this.tanksCollected}<br>Speed Boosts: ${this.speedBoosts}`;
    this.positionDisplay.textContent = `Position: X: ${position.x.toFixed(2)}, Y: ${position.z.toFixed(2)}, Height: ${position.y.toFixed(2)}`;
  },

  gameOver: function () {
    alert(`Game Over! Your final score: ${this.score}`);
    this.oxygen = this.maxOxygen;
    this.score = 0;
    this.tanksCollected = 0;
    this.speedBoosts = 0;
    this.objectivesCompleted = 0;
    this.el.setAttribute('position', '0 1.6 0');
    this.lastGroundedPosition.set(0, 1.6, 0);
    this.velocity.set(0, 0, 0);
    this.setNewObjective();
  },

  checkItemCollection: function (position) {
    const items = document.querySelectorAll('.oxygen-tank, .speed-boost');
    items.forEach(item => {
      const distance = position.distanceTo(item.object3D.position);
      if (distance < 2) {
        if (item.classList.contains('oxygen-tank')) {
          this.collectOxygenTank(item);
        } else if (item.classList.contains('speed-boost')) {
          this.collectSpeedBoost(item);
        }
      }
    });
  },

  collectOxygenTank: function (tank) {
    this.oxygen = Math.min(this.maxOxygen, this.oxygen + 25);
    this.score += 10;
    this.tanksCollected++;
    tank.parentNode.removeChild(tank);
    this.checkObjective();
  },

  collectSpeedBoost: function (boost) {
    this.speedBoosts++;
    this.score += 5;
    boost.parentNode.removeChild(boost);
  },

  setNewObjective: function () {
    if (this.objectivesCompleted >= this.totalObjectives) {
      this.endGame();
      return;
    }

    const objectives = [
      {type: 'collect', target: 5, description: "Collect 5 oxygen tanks"},
      {type: 'height', target: 15, description: "Reach a height of 15 units"},
      {type: 'distance', target: 100, description: "Travel 100 units from the start"},
      {type: 'explore', target: {x: 50, y: 50}, description: "Explore the point (50, 50)"}
    ];
    this.currentObjective = objectives[Math.floor(Math.random() * objectives.length)];
    this.objectiveDisplay.textContent = `Objective: ${this.currentObjective.description}`;
    this.objectiveStartPosition = this.el.object3D.position.clone();
    this.objectiveProgress = 0;
  },

  checkPositionObjectives: function (position) {
    switch (this.currentObjective.type) {
      case 'height':
        if (position.y >= this.currentObjective.target) {
          this.completeObjective();
        }
        break;
      case 'distance':
        const distance = new THREE.Vector2(position.x - this.objectiveStartPosition.x, position.z - this.objectiveStartPosition.z).length();
        if (distance >= this.currentObjective.target) {
          this.completeObjective();
        }
        break;
      case 'explore':
        const targetPosition = new THREE.Vector2(this.currentObjective.target.x, this.currentObjective.target.y);
        const playerPosition = new THREE.Vector2(position.x, position.z);
        if (playerPosition.distanceTo(targetPosition) < 5) {
          this.completeObjective();
        }
        break;
    }
  },

  checkObjective: function () {
    if (this.currentObjective.type === 'collect' && this.tanksCollected >= this.currentObjective.target) {
      this.completeObjective();
    }
  },

  completeObjective: function () {
    this.score += 50;
    this.objectivesCompleted++;
    alert(`Objective completed! +50 points\nObjectives completed: ${this.objectivesCompleted}/${this.totalObjectives}`);

    // Ensure the player stays grounded after dismissing the alert
    this.el.object3D.position.copy(this.lastGroundedPosition);
    this.velocity.set(0, 0, 0);

    this.setNewObjective();
  },

  endGame: function () {
    alert(`Congratulations! You've completed all objectives!\nFinal Score: ${this.score}`);
    // Reset the game
    this.oxygen = this.maxOxygen;
    this.score = 0;
    this.tanksCollected = 0;
    this.speedBoosts = 0;
    this.objectivesCompleted = 0;

    // Reset position to a known safe location
    this.el.setAttribute('position', '0 1.6 0');
    this.lastGroundedPosition.set(0, 1.6, 0);
    this.velocity.set(0, 0, 0);

    this.setNewObjective();
  }
});

AFRAME.registerComponent('day-night-cycle', {
  schema: {
    cycleLength: {type: 'number', default: 60} // Cycle length in seconds
  },

  init: function () {
    this.sky = document.querySelector('a-sky');
    this.directionalLight = document.querySelector('[light]');
    this.time = 0;
  },

  tick: function (time, timeDelta) {
    this.time += timeDelta / 1000;
    const t = (this.time % this.data.cycleLength) / this.data.cycleLength;

    // Update sky color
    const skyColor = new THREE.Color();
    if (t < 0.25) { // Dawn
      skyColor.setHSL(0.1, 0.5, t * 2);
    } else if (t < 0.75) { // Day
      skyColor.setHSL(0.1, 0.5, 0.5);
    } else { // Dusk
      skyColor.setHSL(0.1, 0.5, (1 - t) * 2);
    }
    this.sky.setAttribute('color', `#${skyColor.getHexString()}`);

    // Update directional light
    const lightIntensity = Math.sin(t * Math.PI) * 0.5 + 0.5;
    this.directionalLight.setAttribute('light', 'intensity', lightIntensity);
  }
});

AFRAME.registerComponent('spawn-items', {
  init: function () {
    this.spawnOxygenTank();
    this.spawnSpeedBoost();
    setInterval(() => this.spawnOxygenTank(), 8000); // Spawn a new tank every 8 seconds
    setInterval(() => this.spawnSpeedBoost(), 15000); // Spawn a new speed boost every 15 seconds
  },

  spawnOxygenTank: function () {
    const tank = document.createElement('a-entity');
    tank.setAttribute('geometry', {
      primitive: 'cylinder',
      radius: 0.2,
      height: 0.5
    });
    tank.setAttribute('material', 'color', '#00ff00');
    tank.setAttribute('class', 'oxygen-tank');

    // Random position within a 200x200 area
    const x = Math.random() * 200 - 100;
    const z = Math.random() * 200 - 100;
    const y = 1; // Close to the ground

    tank.setAttribute('position', `${x} ${y} ${z}`);
    tank.setAttribute('ammo-body', 'type: dynamic');
    tank.setAttribute('ammo-shape', 'type: cylinder');

    this.el.sceneEl.appendChild(tank);
  },

  spawnSpeedBoost: function () {
    const boost = document.createElement('a-entity');
    boost.setAttribute('geometry', {
      primitive: 'cylinder',
      radius: 0.2,
      height: 0.5
    });
    boost.setAttribute('material', 'color', '#ffff00');
    boost.setAttribute('class', 'speed-boost');

    // Create zig-zag shape
    const zigzag = document.createElement('a-entity');
    zigzag.setAttribute('geometry', {
      primitive: 'cylinder',
      radius: 0.05,
      height: 0.8
    });
    zigzag.setAttribute('material', 'color', '#ff0000');
    zigzag.setAttribute('position', '0 0.5 0');
    zigzag.setAttribute('rotation', '0 0 30');
    boost.appendChild(zigzag);

    // Random position within a 200x200 area
    const x = Math.random() * 200 - 100;
    const z = Math.random() * 200 - 100;
    const y = 1; // Close to the ground

    boost.setAttribute('position', `${x} ${y} ${z}`);
    boost.setAttribute('ammo-body', 'type: dynamic');
    boost.setAttribute('ammo-shape', 'type: cylinder');

    this.el.sceneEl.appendChild(boost);
  }
});
