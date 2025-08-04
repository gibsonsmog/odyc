import { initCamera } from './camera.js'
import { clearPreviousGame } from './clearGame.js'
import { Config, defaultConfig } from './config.js'
import { initDialog } from './dialog.js'
import { initEnder } from './ender.js'
import { initFilter } from './filter.js'
import { initGameApi } from './gameApi.js'
import { initGameLoop } from './gameLoop.js'
import { initGameState } from './gameState/index.js'
import { getInputsHandler } from './inputs.js'
import { debounce } from './lib'
import { initMessageBox } from './messageBox.js'
import { initPrompt } from './prompt.js'
import { initRenderer } from './renderer.js'
import { initSoundPlayer } from './sound.js'
import { resolveTick } from './lib/index.js'

let clearPrevious: Function | null = () => {}

export const createGame = <T extends string>(
	userConfig?: Partial<Config<T>>,
) => {
	clearPrevious?.()
	const config: Config<T> = Object.assign({}, defaultConfig, userConfig)
	const gameState = initGameState(config)
	const soundPlayer = initSoundPlayer(config)
	const camera = initCamera(config)
	const renderer = initRenderer(config)
	const dialog = initDialog(config)
	const prompt = initPrompt(config)
	const messageBox = initMessageBox(config)
	const gameFilter = initFilter(renderer.canvas.element, config.filter)
	const ender = initEnder({ gameState, messageBox, camera })

	const renderGame = debounce(() => {
		gameFilter?.setUniforms(gameState.filterUniforms.get())
		camera.update(gameState.player.position, gameState.gameMap.dimensions)

		renderer.render(gameState.player, gameState.cells.get(), camera)
		gameFilter?.render()

		gameState.cells.handleScreenEvents(camera)

		resolveTick()
	}, 60)

	const gameLoop = initGameLoop({
		gameState,
		soundPlayer,
		dialog,
		ender,
	})

    getInputsHandler(config, (input) => {
        const isAction = input === 'ACTION'
        const isInteract = input === 'INTERACT'

        /* 
            action and interact are different from a user perspective but we might as well allow either key to work through dialogs
            Interact is specifically sent to gameLoop.update() even though it is similar to action
            because it is used to interact with the adjacent cell and will allow for hidden cells to be interacted with
            without moving the player but also without relying on other cell information such as solid or visible
        */
        if (prompt.isOpen) {
            prompt.input(input)
        } else if (messageBox.isOpen) {
            if (isAction || isInteract) messageBox.next()
        } else if (dialog.isOpen) {
            if (isAction || isInteract) dialog.next()
        } else {
            if (!isAction) gameLoop.update(input)
            gameState.player.dispatchOnInput(input)
        }
	})


	gameState.subscribe(renderGame)

	clearPreviousGame()

	if (config.title) messageBox.open(config.title)

	renderGame()

	return initGameApi<T>(
		gameState,
		dialog,
		prompt,
		soundPlayer,
		ender,
		messageBox,
		renderer,
	)
}
