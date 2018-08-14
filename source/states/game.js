// https://phaser.io/examples/v2/bitmapdata/draw-sprite
// https://phaser.io/phaser3/devlog/99

import qs from 'querystring';

import {
    default as c
} from 'boardgame.io/client';
import {
    default as b
} from 'boardgame.io/core';
import gameConfig from '../../core/common/game';

export const key = 'LEVEL';

let controls;

export function update (time, delta) {
    this.background &&
        this.background.setTilePosition(-this.cameras.main.scrollX / 50, -this.cameras.main.scrollY / 50);
    controls && controls.update(delta);

    const activePawn = this.pawnManager.get('active', true);
    if (activePawn) {
        this.fogGraphic.clear();
        this.fogCircle.setPosition(activePawn.x + 25, activePawn.y + 25)

        this.mapLayer.forEachTile(maskTile, this);

        const tiles = this.mapLayer.getTilesWithinShape(this.fogCircle, {
            isNotEmpty: true
        });
        tiles.forEach(tile => applyFogOpacity.call(this, tile, activePawn, this.fogCircle.radius / 50));
    }
}

function maskTile (tile) {
    const alpha = Number(tile.index === -1);

    this.fogGraphic
        .fillStyle(0x000000, alpha)
        .fillRect(tile.x * tile.width, tile.y * tile.height, tile.width, tile.height);
}

function applyFogOpacity (tile, { x = 0, y = 0 }, maxDistance = 1) {
    const distance =
        Phaser.Math.Clamp(
            Math.max(Math.abs(x - tile.x * 50), Math.abs(y - tile.y * 50)) / 50 - 2,
            0,
            maxDistance
        )
    ;
    const alpha = 1 - distance / maxDistance;

    this.fogGraphic
        .fillStyle(0x000000, alpha)
        .fillRect(tile.x * tile.width, tile.y * tile.height, tile.width, tile.height);
}

export async function create () {
    this.events.on('transitionstart', (fromScene, duration) =>
        this.tweens.add({
            targets: this.cameras.main,
            duration,
            alpha: 1,
            onStart: (tween, [ target ]) => {
                target.alpha = 0;
            },
            onComplete: () => {
                this.scene.launch('UI');
            }
        })
    );

    const {
        room,
        player,
        x = 50,
        y = 50
    } = qs.parse(window.location.search.substr(1));

    this.registry.set('player', {
        id: player,
        room,
        isCurrentTurn: false
    });

    const game = gameConfig();
    this.client = c.Client({
        game: b.Game(game),
        multiplayer: {
            server: 'https://ascension-server.herokuapp.com'
        },
        gameID: room,
        playerID: player
    });
    this.client.connect();

    const {
        client: {
            store: {
                getState,
                subscribe
            }
        }
    } = this;

    this.background = this.add.tileSprite(0, 0, this.sys.game.config.width + 20, this.sys.game.config.height + 20, 'background')
        .setOrigin(0, 0)
        .setScrollFactor(0);

    let map;
    let tileset;
    let blockedLayer;
    let interactionsLayer;
    const unsubscribe = subscribe(() => {
        const {
            G
        } = getState();
        const mapHeight = G.map.length;
        const mapWidth = G.map[0].length;

        unsubscribe();

        map = this.make.tilemap({
            height: mapHeight,
            tileHeight: 50,
            tileWidth: 50,
            width: mapWidth,
        });
        tileset = map.addTilesetImage('tiles');
        this.mapLayer = map
            .createBlankDynamicLayer('map', tileset)
            .putTilesAt(G.map, 0, 0, false);
        blockedLayer = map
            .createBlankDynamicLayer('blocked', tileset)
            .putTilesAt(G.blocked, 0, 0, false);
        interactionsLayer = map
            .createBlankDynamicLayer('interactions', tileset)
            .putTilesAt(G.interactions, 0, 0, false);

        this.goreLayer = this.add.renderTexture(0, 0, 800, 600);
        this.fogGraphicLayer = this.add.renderTexture(0, 0, mapWidth * 50, mapHeight * 50)
            .fill('rgb(0, 0, 0)', .8);
        this.fogGraphic = this.add.graphics(0, 0)
            .setVisible(false);
        this.fogCircle = new Phaser.Geom.Circle(275, 275, 225);

        this.pathfinder.start(G.map, G.blocked, map.width);
        this.pawnManager.start(this.client, this.pathfinder);

        this.fogGraphicLayer.mask = new Phaser.Display.Masks.BitmapMask(this, this.fogGraphic);
        this.fogGraphicLayer.mask.invertAlpha = true;

        const cameraCentreX = -(window.innerWidth - (mapWidth * 50 / 2));
        const cameraCentreY = -(window.innerHeight - (mapHeight * 50 / 2));
        this.cameras.main
            .setBounds(cameraCentreX, cameraCentreY, window.innerWidth * 2, window.innerHeight * 2, true);

        const cameraPanControls = this.input.keyboard.addKeys({
            up: 'W',
            right: 'D',
            down: 'S',
            left: 'A'
        });
        controls = new Phaser.Cameras.Controls.SmoothedKeyControl({
            ...cameraPanControls,
            camera: this.cameras.main,
            maxSpeed: 1.0,
            acceleration: 1,
            drag: .055
        });
    });

    subscribe(() => {
        const {
            ctx
        } = getState();
        const {
            player,
            phase
        } = this.registry.getAll();

        if (ctx.gameover) {
            unsubscribe();
            this.scene.stop('UI');
            return this.scene.start('GAMEOVER', {
                isWinner: ctx.gameover.winner === player.id
            });
        }

        if (phase !== ctx.phase) {
            this.registry.set('phase', ctx.phase);
        }

        this.registry.set('player', {
            ...player,
            isCurrentTurn: player.id === ctx.currentPlayer
        });
    });

    this.events.on('PAWN_DESTROY', onPawnDeath, this);

    this.events.on('resize', resize, this);
}

function onPawnDeath (pawn) {
    return this.goreLayer.draw(
        'blood',
        pawn.x,
        pawn.y
    );
}

function resize (width, height) {
    this.cameras.resize(width, height);
    this.background.setSize(width, height);
}
