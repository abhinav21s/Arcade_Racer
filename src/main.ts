// ============================================================
// NEON ARCADE RACER — Main Entry Point
// ============================================================

import Phaser from 'phaser';
import { BootScene }    from './scenes/BootScene';
import { MenuScene }    from './scenes/MenuScene';
import { GameScene }    from './scenes/GameScene';
import { GameOverScene }from './scenes/GameOverScene';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width:  GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#000000',
  parent: 'phaser-container',
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width:      GAME_WIDTH,
    height:     GAME_HEIGHT,
  },
  render: {
    antialias:      false,   // Crisp pixels for neon art
    pixelArt:       false,
    roundPixels:    true,
    powerPreference:'high-performance',
    batchSize:      4096,
  },
  fps: {
    target: 60,
    forceSetTimeOut: false,
    smoothStep: true,
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
  input: {
    keyboard: true,
    mouse:    true,
    touch:    false,   // Desktop only
    gamepad:  false,
  },
  audio: {
    disableWebAudio: false,  // We manage Web Audio ourselves but Phaser's context is used
    context: undefined,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
};

new Phaser.Game(config);
