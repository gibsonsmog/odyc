import { Dialog } from './dialog.js'
import { Ender } from './ender.js'
import { CellFacade } from './gameState/cellFacade.js'
import { GameState } from './gameState/index.js'
import { vec2 } from './helpers'
import { Input } from './inputs.js'
import { PlaySoundArgs, SoundPlayer } from './sound.js'
import { Position } from './types.js'

export type GameLoopParams<T extends string> = {
	soundPlayer: SoundPlayer
	dialog: Dialog
	gameState: GameState<T>
	ender: Ender
}

class GameLoop<T extends string> {
	#gameState: GameState<T>
	#soundPlayer: SoundPlayer
	#dialog: Dialog
	#ender: Ender

	constructor(params: GameLoopParams<T>) {
		this.#gameState = params.gameState
		this.#soundPlayer = params.soundPlayer
		this.#dialog = params.dialog
		this.#ender = params.ender
	}

    /**
     * Handles player input and updates the game state accordingly.
     * @param input - The input action from the player.
     * ie. 'LEFT', 'RIGHT', 'UP', 'DOWN', 'ACTION', 'INTERACT'
     * @returns A promise that resolves when the input has been processed.
     */
	async update(input: Input) {
		this.#ender.ending = false
		this.#gameState.player.setDirection(input)
        const isInteract = input === 'INTERACT'
		const from = vec2(this.#gameState.player.position)
        // from.add(directions[input] is the adjacent cell relative to the players direction
        // However it is always zero if the player is not moving
        // The ternary will let us use the adjacentCell value regardless if the user interacts
        const to = isInteract ? vec2(this.#gameState.player?.adjacentCell[0], this.#gameState.player?.adjacentCell[1]) : from.add(directions[input])

		const onTurnCellIds = new Set(
			this.#gameState.cells
				.get()
				.filter((el) => el.onTurn)
				.map((el) => el.id),
		)
		if (this.#isCellOnworld(to.value)) {
            // This is the general purpose onWorld check. it fires after every input value

			const cell = this.#gameState.cells.getCellAt(...to.value)
            // using interact should not change the cell
			if (!cell.solid && !isInteract) {
				await this.#gameState.cells.getEvent(...from.value, 'onLeave')?.()
				this.#gameState.player.position = to.value
			}
            if(isInteract) {
                await this.#gameState.cells.getEvent(...to.value, 'onInteract')?.()
            }
			this.#playSound(cell)
			await this.#openDialog(cell)
            
			if (cell.solid && !isInteract) {
                await this.#gameState.cells.getEvent(...to.value, 'onCollide')?.()
            } else await this.#gameState.cells.getEvent(...to.value, 'onEnter')?.()
		}

		for (const cell of this.#gameState.cells.get()) {
			if (onTurnCellIds.has(cell.id))
				await this.#gameState.cells.getEvent(...cell.position, 'onTurn')?.()
		}
		this.#gameState.player.dispatchOnTurn()
		if (!this.#ender.ending) this.#gameState.turn.next()
		await this.#end(this.#gameState.cells.getCellAt(...to.value))
	}

	#playSound(cell: CellFacade<T>) {
		const sound = cell.sound
		if (sound) {
			const soundParams: PlaySoundArgs = Array.isArray(sound) ? sound : [sound]
			this.#soundPlayer.play(...soundParams)
		}
	}
	async #openDialog(cell: CellFacade<T>) {
		if (cell.dialog) await this.#dialog.open(cell.dialog)
	}

	async #end(cell: CellFacade<T>) {
		const endMessage = cell.end
		if (endMessage) {
			if (typeof endMessage === 'string') await this.#ender.play(endMessage)
			else if (typeof endMessage === 'boolean' && endMessage) this.#ender.play()
			else await this.#ender.play(...endMessage)
		}
	}

	#isCellOnworld([x, y]: Position) {
		return (
			x >= 0 &&
			y >= 0 &&
			x < this.#gameState.gameMap.dimensions[0] &&
			y < this.#gameState.gameMap.dimensions[1]
		)
	}
}

const directions: Record<Input, Position> = {
	LEFT: [-1, 0],
	RIGHT: [1, 0],
	UP: [0, -1],
	DOWN: [0, 1],
	ACTION: [0, 0],
    INTERACT: [0, 0]
}

export const initGameLoop = <T extends string>(params: GameLoopParams<T>) =>
	new GameLoop(params)
