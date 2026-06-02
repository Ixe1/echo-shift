import Phaser from "phaser";
import { getLevel, levels } from "../data/levels";
import { audio } from "../game/audio";
import { rectCenter } from "../game/geometry";
import { laserIsActive } from "../game/objects";
import { platformRectAt } from "../game/player";
import { recordLevelScore } from "../game/progress";
import { RoomSimulation } from "../game/state";
import type { ActorBody, InputFrame, Level, LevelScore, Rect, SimulationSnapshot } from "../game/types";
import { Hud } from "../ui/hud";

const STEP_MS = 1000 / 60;

type KeyMap = {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
  t: Phaser.Input.Keyboard.Key;
  esc: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: Level;
  private simulation!: RoomSimulation;
  private keys!: KeyMap;
  private hud!: Hud;
  private world!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private accumulator = 0;
  private pausedByHud = false;
  private completeHandled = false;
  private virtualInput: InputFrame = { left: false, right: false, jump: false };
  private echoTrails = new Map<string, Array<{ x: number; y: number }>>();
  private actorSprites = new Map<string, Phaser.GameObjects.Image>();
  private coreSprites = new Map<string, Phaser.GameObjects.Image>();
  private exitSprite?: Phaser.GameObjects.Image;
  private playerCastUntil = 0;

  constructor() {
    super("GameScene");
  }

  init(data: { levelIndex?: number }): void {
    this.levelIndex = data.levelIndex || 0;
    this.level = getLevel(this.levelIndex);
    this.simulation = new RoomSimulation(this.level);
    this.accumulator = 0;
    this.pausedByHud = false;
    this.completeHandled = false;
    this.virtualInput = { left: false, right: false, jump: false };
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.actorSprites.clear();
    this.coreSprites.clear();
    this.exitSprite = undefined;
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, 960, 540);
    this.cameras.main.setBackgroundColor("#05070d");
    this.world = this.add.graphics().setDepth(0);
    this.fx = this.add.graphics().setDepth(30);
    this.keys = this.createKeys();
    this.hud = new Hud({
      onRewind: () => this.rewind(),
      onRetry: () => this.retryAttempt(),
      onPause: () => this.togglePause(),
      onTitle: () => this.scene.start("MenuScene"),
      onNext: () => this.nextLevel(),
      onReplay: () => this.restartLevel(),
      onLevelSelect: () => this.scene.start("LevelSelectScene"),
      onResume: () => this.togglePause(false),
      onVirtualInput: (control, active) => {
        this.virtualInput[control] = active;
      }
    });
    this.hud.toast(`${this.level.index + 1}: ${this.level.name}`);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hud.destroy());
    this.renderWorld();
  }

  update(_time: number, delta: number): void {
    this.handleHotkeys();
    if (this.pausedByHud || this.completeHandled) {
      this.renderWorld();
      return;
    }

    this.accumulator += Math.min(delta, 80);
    while (this.accumulator >= STEP_MS) {
      const events = this.simulation.step(this.readInput());
      this.handleEvents(events);
      this.accumulator -= STEP_MS;
      if (this.completeHandled) break;
    }

    this.renderWorld();
    this.hud.update({
      levelNumber: this.level.index + 1,
      levelName: this.level.name,
      frames: this.simulation.totalFrames,
      echoes: this.simulation.echoRecordings.length,
      medal: this.simulation.scoreMedal(),
      dead: this.simulation.dead
    });
  }

  private createKeys(): KeyMap {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input unavailable");
    return {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      r: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      t: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T),
      esc: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    };
  }

  private readInput(): InputFrame {
    return {
      left: this.keys.left.isDown || this.keys.a.isDown || this.virtualInput.left,
      right: this.keys.right.isDown || this.keys.d.isDown || this.virtualInput.right,
      jump: this.keys.up.isDown || this.keys.w.isDown || this.keys.space.isDown || this.virtualInput.jump
    };
  }

  private handleHotkeys(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.rewind();
    if (Phaser.Input.Keyboard.JustDown(this.keys.t)) this.retryAttempt();
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) this.togglePause();
  }

  private handleEvents(events: ReturnType<RoomSimulation["step"]>): void {
    if (events.jumped) audio.play("jump");
    if (events.landed) audio.play("land");
    if (events.switched) audio.play("switch");
    if (events.core) {
      audio.play("core");
      this.spawnBurst(events.core, 0xffe35a);
      this.spawnEffectFrame(events.core, 2, 0.42);
    }
    if (events.died) {
      audio.play("death");
      this.cameras.main.shake(180, 0.006);
      this.hud.toast("Signal lost. Rewind or retry.");
    }
    if (events.won) this.completeLevel();
  }

  private rewind(): void {
    if (this.completeHandled || this.pausedByHud) return;
    const added = this.simulation.rewindToEcho();
    audio.play("rewind");
    this.playerCastUntil = this.time.now + 360;
    this.hud.scan();
    this.cameras.main.flash(220, 67, 247, 255, false);
    this.echoTrails.clear();
    this.hud.toast(added ? `Echo ${this.simulation.echoRecordings.length} anchored` : "Attempt reset");
  }

  private retryAttempt(): void {
    if (this.completeHandled || this.pausedByHud) return;
    this.simulation.resetAttempt(false);
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    audio.play("select");
    this.hud.toast("Attempt reset");
  }

  private restartLevel(): void {
    this.completeHandled = false;
    this.pausedByHud = false;
    this.virtualInput = { left: false, right: false, jump: false };
    this.simulation.resetLevel();
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.hud.hideModal();
    this.hud.toast(`${this.level.index + 1}: ${this.level.name}`);
  }

  private togglePause(force?: boolean): void {
    if (this.completeHandled) return;
    this.pausedByHud = force ?? !this.pausedByHud;
    if (this.pausedByHud) this.hud.showPause(this.level.name);
    else this.hud.hideModal();
    audio.play("select");
  }

  private completeLevel(): void {
    if (this.completeHandled) return;
    this.completeHandled = true;
    audio.play("portal");
    const score: LevelScore = {
      levelId: this.level.id,
      frames: this.simulation.totalFrames,
      echoes: this.simulation.echoRecordings.length,
      medal: this.simulation.scoreMedal()
    };
    recordLevelScore(score, this.level.index);
    this.cameras.main.flash(280, 255, 227, 90, false);
    this.hud.showComplete(score, this.level.index === levels.length - 1);
  }

  private nextLevel(): void {
    const next = Math.min(this.levelIndex + 1, levels.length - 1);
    this.scene.start("GameScene", { levelIndex: next });
  }

  private renderWorld(): void {
    const snapshot = this.simulation.snapshot();
    this.world.clear();
    this.fx.clear();
    this.drawBackground();
    this.drawSolids();
    this.drawPlatforms(snapshot.tick);
    this.drawDoors(snapshot.openDoors);
    this.drawPlates(snapshot.activePlates);
    this.drawCores(snapshot.collectedCores);
    this.drawLasers(snapshot.activePlates, snapshot.blockedLasers);
    this.drawHazards();
    this.drawExit(this.level.exit, snapshot.won);
    this.drawEchoes(snapshot.echoes);
    this.drawActor(snapshot.player, snapshot.dead ? 0xff4f8b : 0x43f7ff, 1);
    this.drawForegroundText(snapshot.tick);
    this.syncSpriteLayer(snapshot);
  }

  private drawBackground(): void {
    const pulse = 0.5 + Math.sin(this.time.now / 900) * 0.5;
    this.world.fillStyle(0x05070d, 1);
    this.world.fillRect(0, 0, 960, 540);
    this.world.fillStyle(0x081322, 0.92);
    this.world.fillRect(0, 0, 960, 540);
    this.world.fillStyle(0x0f1830, 0.64);
    this.world.fillRect(42, 90, 188, 300);
    this.world.fillRect(704, 70, 174, 330);
    this.world.lineStyle(1, 0x43f7ff, 0.16 + pulse * 0.06);
    for (let y = 112; y <= 360; y += 38) {
      this.world.lineBetween(56, y, 216, y + 10);
      this.world.lineBetween(718, y + 8, 866, y - 8);
    }
    this.world.lineStyle(1, 0x123246, 0.36);
    for (let x = 0; x <= 960; x += 40) this.world.lineBetween(x, 0, x, 540);
    for (let y = 20; y <= 540; y += 40) this.world.lineBetween(0, y, 960, y);
    this.world.lineStyle(1, 0x5d2f83, 0.22);
    for (let x = -120; x < 960; x += 120) this.world.lineBetween(x, 540, x + 300, 0);
    this.world.fillStyle(0x09111d, 0.86);
    this.world.fillRect(0, 500, 960, 40);
    this.world.fillStyle(0x43f7ff, 0.1 + pulse * 0.08);
    this.world.fillRect(330, 507, 310, 4);
    this.world.fillStyle(0xbd5cff, 0.12);
    this.world.fillRect(76, 508, 150, 3);
  }

  private drawSolids(): void {
    for (const solid of this.level.solids) {
      const color = solid.tone === "dark" ? 0x111827 : solid.tone === "warning" ? 0x473b18 : 0x17243a;
      this.drawNeonRect(solid, color, 0x43f7ff, 0.34);
      this.world.lineStyle(1, 0xffffff, 0.06);
      this.world.lineBetween(solid.x, solid.y + 4, solid.x + solid.w, solid.y + 4);
    }
  }

  private drawPlatforms(tick: number): void {
    for (const platform of this.level.platforms || []) {
      const rect = platformRectAt(platform, tick);
      this.drawNeonRect(rect, 0x1f2e46, 0xffe35a, 0.72);
      this.world.lineStyle(1, 0xffe35a, 0.28);
      if (platform.axis === "y") {
        this.world.lineBetween(platform.x + platform.w / 2, platform.y - platform.distance, platform.x + platform.w / 2, platform.y + platform.distance);
      } else {
        this.world.lineBetween(platform.x - platform.distance, platform.y + platform.h / 2, platform.x + platform.distance, platform.y + platform.h / 2);
      }
    }
  }

  private drawDoors(openDoors: Set<string>): void {
    for (const door of this.level.doors || []) {
      const open = openDoors.has(door.id);
      this.world.fillStyle(open ? 0x43f7ff : 0x29122d, open ? 0.09 : 0.92);
      this.world.fillRect(door.x, door.y, door.w, door.h);
      this.world.lineStyle(2, open ? 0x43f7ff : 0xff4f8b, open ? 0.38 : 0.9);
      this.world.strokeRect(door.x, door.y, door.w, door.h);
      for (let y = door.y + 10; y < door.y + door.h; y += 14) {
        this.world.lineStyle(1, open ? 0x43f7ff : 0xff4f8b, open ? 0.18 : 0.3);
        this.world.lineBetween(door.x + 3, y, door.x + door.w - 3, y);
      }
      const nodeColor = open ? 0x43f7ff : 0xff4f8b;
      this.world.fillStyle(nodeColor, open ? 0.42 : 0.86);
      this.world.fillCircle(door.x + door.w / 2, door.y + 15, 4);
      this.world.fillCircle(door.x + door.w / 2, door.y + door.h - 15, 4);
      this.world.lineStyle(1, nodeColor, open ? 0.2 : 0.56);
      this.world.lineBetween(door.x + door.w / 2, door.y + 21, door.x + door.w / 2, door.y + door.h - 21);
    }
  }

  private drawPlates(activePlates: Set<string>): void {
    for (const plate of this.level.plates || []) {
      const active = activePlates.has(plate.id);
      this.world.fillStyle(active ? 0xffe35a : 0x163247, active ? 0.9 : 0.78);
      this.world.fillRect(plate.x, plate.y, plate.w, plate.h);
      this.world.lineStyle(2, active ? 0xfff4a0 : 0x43f7ff, active ? 0.86 : 0.36);
      this.world.strokeRect(plate.x, plate.y, plate.w, plate.h);
    }
  }

  private drawCores(collectedCores: Set<string>): void {
    for (const core of this.level.cores || []) {
      if (collectedCores.has(core.id)) continue;
      const center = rectCenter(core);
      const pulse = 1 + Math.sin(this.time.now / 140) * 0.12;
      this.world.fillStyle(0xffe35a, 0.18);
      this.world.fillCircle(center.x, center.y, 22 * pulse);
      if (!this.textures.exists("time-effects")) {
        this.drawDiamond(center.x, center.y, 12 * pulse, 0xffe35a, 0.9, 0xffffff, 0.72);
      }
      this.world.lineStyle(2, 0xffffff, 0.7);
      this.world.strokeCircle(center.x, center.y, 17 * pulse);
      this.world.lineStyle(1, 0xffe35a, 0.5);
      this.world.lineBetween(center.x - 18, center.y, center.x + 18, center.y);
    }
  }

  private drawLasers(activePlates: Set<string>, blockedLasers: Set<string>): void {
    for (const laser of this.level.lasers || []) {
      const active = laserIsActive(laser, activePlates);
      if (!active) {
        this.world.lineStyle(2, 0x43f7ff, 0.16);
        this.world.strokeRect(laser.x, laser.y, laser.w, laser.h);
        continue;
      }
      const blocked = blockedLasers.has(laser.id);
      this.world.fillStyle(blocked ? 0xffe35a : 0xff2f6c, blocked ? 0.3 : 0.72);
      this.world.fillRect(laser.x, laser.y, laser.w, laser.h);
      this.world.lineStyle(2, blocked ? 0xffe35a : 0xff4f8b, blocked ? 0.9 : 1);
      this.world.strokeRect(laser.x, laser.y, laser.w, laser.h);
      this.world.fillStyle(0xffffff, blocked ? 0.18 : 0.34);
      this.world.fillRect(laser.x, laser.y + laser.h / 2 - 1, laser.w, 2);
      this.world.fillStyle(blocked ? 0xffe35a : 0xffffff, blocked ? 0.14 : 0.28);
      for (let x = laser.x + ((this.simulation.tick * 2) % 16); x < laser.x + laser.w; x += 18) {
        this.world.fillRect(x, laser.y + 2, 7, Math.max(2, laser.h - 4));
      }
    }
  }

  private drawHazards(): void {
    for (const hazard of this.level.hazards || []) {
      this.world.fillStyle(0xff4f8b, 0.14);
      this.world.fillRect(hazard.x, hazard.y - 6, hazard.w, hazard.h + 10);
      this.world.fillStyle(0xff4f8b, 0.7);
      for (let x = hazard.x; x < hazard.x + hazard.w; x += 12) {
        this.world.fillTriangle(x, hazard.y + hazard.h, x + 6, hazard.y, x + 12, hazard.y + hazard.h);
        this.world.lineStyle(1, 0xffffff, 0.16);
        this.world.lineBetween(x + 6, hazard.y + 2, x + 6, hazard.y + hazard.h - 3);
      }
    }
  }

  private drawExit(exit: Rect, won: boolean): void {
    const center = rectCenter(exit);
    const spin = this.time.now / 260;
    this.world.fillStyle(won ? 0xffe35a : 0x43f7ff, 0.13);
    this.world.fillEllipse(center.x, center.y, exit.w * 1.4, exit.h * 1.2);
    this.world.fillStyle(0xbd5cff, 0.12);
    this.world.fillEllipse(center.x, center.y, exit.w * 1.1, exit.h * 0.88);
    this.world.lineStyle(3, won ? 0xffe35a : 0x43f7ff, 0.82);
    this.world.strokeEllipse(center.x, center.y, exit.w, exit.h);
    this.world.lineStyle(1, 0xffffff, 0.3);
    this.world.strokeEllipse(center.x, center.y, exit.w * 0.7, exit.h * 0.7);
    this.world.lineStyle(2, 0xbd5cff, 0.72);
    this.world.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const angle = spin + i * 1.26;
      const x = center.x + Math.cos(angle) * exit.w * 0.32;
      const y = center.y + Math.sin(angle) * exit.h * 0.42;
      if (i === 0) this.world.moveTo(x, y);
      else this.world.lineTo(x, y);
    }
    this.world.closePath();
    this.world.strokePath();
  }

  private drawEchoes(echoes: ActorBody[]): void {
    for (let index = 0; index < echoes.length; index += 1) {
      const echo = echoes[index];
      this.updateTrail(echo);
      const trail = this.echoTrails.get(echo.id) || [];
      for (let i = 0; i < trail.length; i += 1) {
        const point = trail[i];
        this.world.fillStyle(index % 2 === 0 ? 0xbd5cff : 0x50ffc2, (i + 1) / trail.length * 0.12);
        this.world.fillRect(point.x, point.y, echo.w, echo.h);
      }
      this.drawActor(echo, index % 2 === 0 ? 0xbd5cff : 0x50ffc2, 0.42);
    }
  }

  private drawActor(actor: ActorBody, color: number, alpha: number): void {
    const centerX = actor.x + actor.w / 2;
    const centerY = actor.y + actor.h / 2;
    this.world.fillStyle(color, alpha * 0.13);
    this.world.fillCircle(centerX, centerY, 28);
    this.world.fillStyle(0x000000, alpha * 0.26);
    this.world.fillEllipse(centerX, actor.y + actor.h + 3, actor.w * 0.94, 8);
    if (this.textures.exists("time-runner")) return;

    this.world.fillStyle(0x08111f, alpha);
    this.world.fillRoundedRect(actor.x + 2, actor.y + 9, actor.w - 4, actor.h - 13, 6);
    this.world.fillStyle(0x13233b, alpha);
    this.world.fillRoundedRect(actor.x + 5, actor.y, actor.w - 10, 18, 6);
    this.world.lineStyle(2, color, alpha);
    this.world.strokeRoundedRect(actor.x + 2, actor.y + 9, actor.w - 4, actor.h - 13, 6);
    this.world.strokeRoundedRect(actor.x + 5, actor.y, actor.w - 10, 18, 6);
    const visorX = actor.facing > 0 ? actor.x + actor.w - 14 : actor.x + 6;
    this.world.fillStyle(color, alpha * 0.88);
    this.world.fillRoundedRect(visorX, actor.y + 6, 8, 5, 2);
    this.world.fillStyle(0xffffff, alpha * 0.52);
    this.world.fillRect(visorX + 1, actor.y + 7, 3, 1);
    this.world.fillStyle(color, alpha * 0.52);
    this.world.fillRect(actor.x + 7, actor.y + actor.h - 8, 7, 3);
    this.world.fillRect(actor.x + actor.w - 14, actor.y + actor.h - 8, 7, 3);
    this.world.lineStyle(1, color, alpha * 0.42);
    this.world.lineBetween(centerX, actor.y + 20, centerX, actor.y + actor.h - 10);
    this.drawDiamond(centerX, actor.y + 24, 4, color, alpha * 0.9, 0xffffff, alpha * 0.3);
  }

  private syncSpriteLayer(snapshot: SimulationSnapshot): void {
    this.syncActorSprites(snapshot);
    this.syncCoreSprites(snapshot);
    this.syncExitSprite(snapshot);
  }

  private syncActorSprites(snapshot: SimulationSnapshot): void {
    if (!this.textures.exists("time-runner")) return;

    const activeIds = new Set<string>();
    this.syncActorSprite(snapshot.player, snapshot.dead, 0x43f7ff, 1, snapshot.tick);
    activeIds.add(snapshot.player.id);

    for (let index = 0; index < snapshot.echoes.length; index += 1) {
      const echo = snapshot.echoes[index];
      const tint = index % 2 === 0 ? 0xbd5cff : 0x50ffc2;
      this.syncActorSprite(echo, false, tint, 0.58, snapshot.tick);
      activeIds.add(echo.id);
    }

    for (const [id, sprite] of this.actorSprites) {
      if (!activeIds.has(id)) sprite.setVisible(false);
    }
  }

  private syncActorSprite(actor: ActorBody, dead: boolean, tint: number, alpha: number, tick: number): void {
    let sprite = this.actorSprites.get(actor.id);
    if (!sprite) {
      sprite = this.add.image(0, 0, "time-runner", 0).setOrigin(0.5, 1).setDepth(16);
      this.actorSprites.set(actor.id, sprite);
    }

    sprite
      .setVisible(true)
      .setFrame(this.actorFrame(actor, dead, tick))
      .setPosition(Math.round(actor.x + actor.w / 2), Math.round(actor.y + actor.h + 5))
      .setFlipX(actor.facing < 0)
      .setAlpha(alpha)
      .setScale(actor.kind === "echo" ? 0.88 : 1);

    if (actor.kind === "echo") sprite.setTint(tint);
    else if (dead) sprite.setTint(0xff4f8b);
    else sprite.clearTint();
  }

  private actorFrame(actor: ActorBody, dead: boolean, tick: number): number {
    if (dead) return 7;
    if (actor.kind === "player" && this.time.now < this.playerCastUntil) return 6;
    if (!actor.onGround && actor.vy < -1.2) return 3;
    if (!actor.onGround && actor.vy > 1.2) return 4;
    if (actor.onGround && Math.abs(actor.vx) > 1.1) return tick % 16 < 8 ? 1 : 2;
    if (actor.onGround && Math.abs(actor.vx) > 0.2) return 5;
    return 0;
  }

  private syncCoreSprites(snapshot: SimulationSnapshot): void {
    if (!this.textures.exists("time-effects")) return;
    const activeIds = new Set<string>();

    for (const core of this.level.cores || []) {
      if (snapshot.collectedCores.has(core.id)) continue;
      const center = rectCenter(core);
      let sprite = this.coreSprites.get(core.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, "time-effects", 0).setDepth(11);
        this.coreSprites.set(core.id, sprite);
      }
      sprite
        .setVisible(true)
        .setFrame(snapshot.tick % 44 < 22 ? 0 : 1)
        .setPosition(Math.round(center.x), Math.round(center.y))
        .setScale(0.34)
        .setAlpha(0.94);
      activeIds.add(core.id);
    }

    for (const [id, sprite] of this.coreSprites) {
      if (!activeIds.has(id)) sprite.setVisible(false);
    }
  }

  private syncExitSprite(snapshot: SimulationSnapshot): void {
    if (!this.textures.exists("time-effects")) return;
    const center = rectCenter(this.level.exit);
    if (!this.exitSprite) {
      this.exitSprite = this.add.image(0, 0, "time-effects", 3).setDepth(10);
    }
    this.exitSprite
      .setVisible(true)
      .setFrame(snapshot.won ? 5 : snapshot.tick % 48 < 24 ? 3 : 4)
      .setPosition(Math.round(center.x), Math.round(center.y))
      .setScale(snapshot.won ? 0.72 : 0.66)
      .setAlpha(0.9);
  }

  private drawForegroundText(tick: number): void {
    const subtitleAlpha = 0.34 + Math.sin(tick / 45) * 0.08;
    this.world.lineStyle(1, 0x43f7ff, 0.16);
    this.world.strokeRect(18, 66, 260, 34);
    this.world.fillStyle(0x43f7ff, subtitleAlpha);
    this.world.fillRect(24, 76, Math.min(210, this.level.subtitle.length * 7), 3);
  }

  private drawNeonRect(rect: Rect, fill: number, stroke: number, alpha: number): void {
    this.world.fillStyle(fill, 0.95);
    this.world.fillRect(rect.x, rect.y, rect.w, rect.h);
    this.world.lineStyle(2, stroke, alpha);
    this.world.strokeRect(rect.x, rect.y, rect.w, rect.h);
    this.world.fillStyle(0xffffff, 0.04);
    this.world.fillRect(rect.x + 3, rect.y + 3, Math.max(0, rect.w - 6), 3);
  }

  private drawDiamond(
    x: number,
    y: number,
    radius: number,
    fill: number,
    alpha: number,
    stroke: number,
    strokeAlpha: number
  ): void {
    this.world.fillStyle(fill, alpha);
    this.world.beginPath();
    this.world.moveTo(x, y - radius);
    this.world.lineTo(x + radius * 0.78, y);
    this.world.lineTo(x, y + radius);
    this.world.lineTo(x - radius * 0.78, y);
    this.world.closePath();
    this.world.fillPath();
    this.world.lineStyle(1, stroke, strokeAlpha);
    this.world.strokePath();
  }

  private updateTrail(actor: ActorBody): void {
    const trail = this.echoTrails.get(actor.id) || [];
    trail.push({ x: actor.x, y: actor.y });
    while (trail.length > 16) trail.shift();
    this.echoTrails.set(actor.id, trail);
  }

  private spawnBurst(origin: { x: number; y: number }, color: number): void {
    for (let i = 0; i < 9; i += 1) {
      const dot = this.add.circle(origin.x, origin.y, 3, color, 0.85).setDepth(26);
      const angle = (Math.PI * 2 * i) / 9;
      this.tweens.add({
        targets: dot,
        x: dot.x + Math.cos(angle) * 38,
        y: dot.y + Math.sin(angle) * 28,
        alpha: 0,
        scale: 0.3,
        duration: 360,
        ease: "Cubic.easeOut",
        onComplete: () => dot.destroy()
      });
    }
  }

  private spawnEffectFrame(origin: { x: number; y: number }, frame: number, scale: number): void {
    if (!this.textures.exists("time-effects")) return;
    const sprite = this.add.image(origin.x, origin.y, "time-effects", frame).setDepth(25).setScale(scale).setAlpha(0.9);
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      scale: scale * 1.5,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => sprite.destroy()
    });
  }
}
