// * Global utility

enum Owner {
	Neutral = -1,
	Opponent = 0,
	Self = 1,
}

enum Side {
	Left,
	Right,
}

type Cell = {
	x: number;
	y: number;
	scrapAmount: number;
	units: number;
	recycler: boolean;
	canBuild: boolean;
	canSpawn: boolean;
	canMove: boolean;
	inRangeOfRecycler: boolean;
	owner: Owner;
	willDestruct: boolean;
	movingUnits: number;
	hasAction: boolean;
	neighbors: Cell[];
	buildRecycler(): string;
	spawn(amount: number): string;
	move(cell: Cell, amount: number): string;
	_closestEnemy: ScoredCell | null;
	closestEnemy(): ScoredCell | null;
	_closestEmptyCell: ScoredCell | null;
	closestEmptyCell(): ScoredCell | null;
	_threat: number | null;
	threat(): number;
	_support: number | null;
	support(): number;
	_attackPower: number | null;
	attackPower(): number;
	_isBlocking: boolean | null;
	isBlocking(): boolean;
	_reach: { [key: symbol]: { [key: symbol]: number } };
	reach(ignore: Cell, maxDepth: number): number;
	distanceTo(cell: Cell): number;
};
type ScoredCell = {
	cell: Cell;
	score: number;
};
type CellSet = { [key: symbol]: Cell };
type CellHashSet = { [key: symbol]: true };
type Position = { x: number; y: number };

type CloseCellSummary = {
	enemyRobotsAmount: number;
	selfRobotsAmount: number;
	enemyCellsAmount: number;
	selfCellsAmount: number;
	unownedCells: number;
	foeOrUnownedCells: number;
	blocking: boolean;
};

const cellKeys: { [key: number]: { [key: number]: symbol } } = {};
const cellNeighbors: { [key: symbol]: Position[] } = {};
let width = 0;
let height = 0;

let directions = [
	{ x: 0, y: -1 },
	{ x: 0, y: 1 },
	{ x: -1, y: 0 },
	{ x: 1, y: 0 },
];

const blockingChecks = [
	// Left/Right
	{ open: [1, 6], closed: [[3, 4]] },
	// Up/Down
	{ open: [3, 4], closed: [[1, 6]] },
	// Angles
	{ open: [0, 6], closed: [[3, 4]] },
	{
		open: [0, 7],
		closed: [
			[1, 6],
			[3, 4],
		],
	},
	{ open: [1, 7], closed: [[3, 4]] },
	{
		open: [2, 5],
		closed: [
			[1, 6],
			[3, 4],
		],
	},
	{ open: [2, 6], closed: [[3, 4]] },
	{
		open: [2, 7],
		closed: [
			[1, 6],
			[3, 4],
		],
	},
];

function exists(position: Position) {
	return position.x >= 0 && position.y >= 0 && position.x < width && position.y < height;
}

function ownedMovableCell(_: Cell, cell: Cell) {
	return cell.owner === Owner.Self && !cell.recycler && cell.canMove;
}

function unownedCell(_: Cell, cell: Cell) {
	return cell.owner !== Owner.Self && cell.movingUnits === 0 && cell.canMove && !cell.recycler;
}

function ownedAvailableRobot(_: Cell, cell: Cell) {
	return cell.owner === Owner.Self && cell.units > 0 && !cell.hasAction;
}

function ownedSpawnable(_: Cell, cell: Cell) {
	return cell.owner === Owner.Self && cell.canSpawn;
}

function enemyCell(_: Cell, cell: Cell) {
	return (
		cell.owner === Owner.Opponent &&
		cell.canMove &&
		!cell.recycler &&
		(cell.movingUnits === 0 || cell.movingUnits < cell.units)
	);
}

function dfs(start: Cell, goal: (start: Cell, target: Cell) => boolean) {
	const explored: { [key: symbol]: boolean } = { [cellKeys[start.y][start.x]]: true };
	const queue: ScoredCell[] = start.neighbors
		.filter((neighbor) => neighbor.canMove)
		.map((neighbor) => ({ cell: neighbor, score: 1 }));

	while (queue.length > 0) {
		const node = queue.splice(0, 1)[0];
		if (goal(start, node.cell)) {
			return node;
		}
		const neighbors = node.cell.neighbors.filter((neighbor) => neighbor.canMove);
		for (const neighbor of neighbors) {
			if (!explored[cellKeys[neighbor.y][neighbor.x]]) {
				explored[cellKeys[neighbor.y][neighbor.x]] = true;
				queue.push({ cell: neighbor, score: node.score + 1 });
			}
		}
	}

	return null;
}

function prioritizeSpreadToCell(destination: Cell) {
	return function (a: Cell, b: Cell) {
		// Prioritize unowned cells
		if (a.owner !== Owner.Self && b.owner === Owner.Self) {
			return -1;
		} else if (b.owner !== Owner.Self && a.owner === Owner.Self) {
			return 1;
		}
		// And then by distance to the destination
		const aDistance = a.distanceTo(destination);
		const bDistance = b.distanceTo(destination);
		if (aDistance < bDistance) {
			return -1;
		} else if (bDistance < aDistance) {
			return 1;
		}
		return 0;
	};
}

function prioritizeExploration(ignore: Cell) {
	return function (a: Cell, b: Cell) {
		// -- and then prioritize the closest enemy cells
		if (a.closestEmptyCell() && b.closestEmptyCell()) {
			let aEnemy = a.closestEmptyCell()!.score;
			let bEnemy = b.closestEmptyCell()!.score;
			if (aEnemy < bEnemy) {
				return -1;
			} else if (bEnemy < aEnemy) {
				return 1;
			}
		} else if (a.closestEmptyCell()) {
			return -1;
		} else if (b.closestEmptyCell()) {
			return 1;
		}
		// Prioritize cells with the biggest reach
		const aReach = a.reach(ignore, 4);
		const bReach = b.reach(ignore, 4);
		if (aReach > bReach) {
			return -1;
		} else if (bReach > aReach) {
			return 1;
		}
		return 0;
	};
}

function prioritizeOpponent(a: Cell, b: Cell) {
	// Prioritize opponent cells
	if (a.owner !== Owner.Self && b.owner === Owner.Self) {
		return -1;
	} else if (b.owner !== Owner.Self && a.owner === Owner.Self) {
		return 1;
	}
	// Prioritize the closest empty cell
	const aThreat = a.threat();
	const bThreat = b.threat();
	if (bThreat < aThreat) {
		return -1;
	} else if (aThreat < bThreat) {
		return 1;
	}
	// Prioritize the closest enemy cells
	if (a.closestEnemy() && b.closestEnemy()) {
		let aEnemy = a.closestEnemy()!.score;
		let bEnemy = b.closestEnemy()!.score;
		if (aEnemy < bEnemy) {
			return -1;
		} else if (bEnemy < aEnemy) {
			return 1;
		}
	} else if (a.closestEnemy()) {
		return -1;
	} else if (b.closestEnemy()) {
		return 1;
	}
	// Prioritize by amount of units
	if (a.owner === Owner.Opponent && b.owner === Owner.Opponent) {
		return a.units - b.units;
	}
	return 0;
}

function prioritizeFilling(a: Cell, b: Cell) {
	// Prioritize the closest empty cell
	if (a.closestEmptyCell() && b.closestEmptyCell()) {
		let aEmpty = a.closestEmptyCell()!.score;
		let bEmpty = b.closestEmptyCell()!.score;
		if (aEmpty < bEmpty) {
			return -1;
		} else if (bEmpty < aEmpty) {
			return 1;
		}
	} else if (a.closestEmptyCell()) {
		return -1;
	} else if (b.closestEmptyCell()) {
		return 1;
	}
	return 0;
}

// * Map utility

function mostProfitableRecyclerCells(ownedCells: Cell[]) {
	const cells: ScoredCell[] = [];
	for (const cell of ownedCells) {
		if (
			!cell.canBuild ||
			cell.movingUnits > 0 ||
			cell.inRangeOfRecycler ||
			cell.scrapAmount < 3 ||
			cell.closestEmptyCell() === null
		) {
			continue;
		}
		let score = 0;
		for (const neighbor of cell.neighbors) {
			if (
				!neighbor.inRangeOfRecycler &&
				!neighbor.recycler &&
				(neighbor.scrapAmount > cell.scrapAmount || neighbor.owner === Owner.Opponent)
			) {
				score += 10;
			}
		}
		// Filter cells that don't have at least 3 neighbors that will survive
		// -- or belongs to the opponent
		if (score >= 30) {
			cells.push({ cell, score });
		}
	}
	return cells.sort((a, b) => b!.score - a!.score);
}

// * Bot

const inputs: string[] = readline().split(" ");
width = parseInt(inputs[0]);
height = parseInt(inputs[1]);
const map: CellSet = {};
const exploreSpawnLimit = Math.floor(height * 0.8);

// Calculate cellKeys
for (let y = 0; y < height; y++) {
	cellKeys[y] = {};
	for (let x = 0; x < width; x++) {
		const key = Symbol();
		map[key] = {
			x,
			y,
			scrapAmount: 0,
			owner: Owner.Neutral,
			units: 0,
			recycler: false,
			canBuild: true,
			canSpawn: true,
			canMove: true,
			inRangeOfRecycler: true,
			willDestruct: true,
			movingUnits: 0,
			hasAction: false,
			neighbors: [],
			buildRecycler() {
				this.canBuild = false;
				this.canSpawn = false;
				this.recycler = true;
				this.hasAction = true;
				for (const neighbor of this.neighbors) {
					neighbor.inRangeOfRecycler = true;
					if (neighbor.scrapAmount === 1) {
						neighbor.willDestruct = true;
					}
				}
				return `BUILD ${this.x} ${this.y}`;
			},
			spawn(amount: number) {
				// this.units += amount;
				this.movingUnits += amount;
				return `SPAWN ${amount} ${this.x} ${this.y}`;
			},
			move(cell: Cell, amount: number) {
				// cell.units += amount;
				cell.movingUnits += amount;
				this.units -= amount;
				return `MOVE ${amount} ${this.x} ${this.y} ${cell.x} ${cell.y}`;
			},
			_closestEnemy: null,
			closestEnemy() {
				if (!this._closestEnemy) {
					this._closestEnemy = dfs(this, enemyCell);
				}
				return this._closestEnemy;
			},
			_closestEmptyCell: null,
			closestEmptyCell() {
				if (!this._closestEmptyCell) {
					this._closestEmptyCell = dfs(this, unownedCell);
				}
				return this._closestEmptyCell;
			},
			_threat: null,
			threat() {
				if (this._threat === null) {
					this._threat =
						this.units +
						this.neighbors.reduce((acc, neighbor) => {
							if (neighbor.owner === Owner.Opponent) {
								return acc + neighbor.units;
							}
							return acc;
						}, 0);
				}
				return this._threat;
			},
			_support: null,
			support() {
				if (this._support === null) {
					this._support =
						this.units +
						this.neighbors.reduce((acc, neighbor) => {
							if (neighbor.owner === Owner.Self) {
								return acc + neighbor.units;
							}
							return acc;
						}, 0);
				}
				return this._support;
			},
			_attackPower: null,
			attackPower() {
				if (this._attackPower === null) {
					this._attackPower = this.neighbors.reduce((acc, neighbor) => {
						if (neighbor.owner === Owner.Self) {
							return acc + neighbor.units;
						}
						return acc;
					}, 0);
				}
				return this._attackPower;
			},
			_isBlocking: null,
			isBlocking() {
				if (this._isBlocking === null) {
					// Generate surrounding state
					const surround = [
						(() => {
							const position = { x: this.x - 1, y: this.y - 1 };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
						(() => {
							const position = { x: this.x, y: this.y - 1 };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
						(() => {
							const position = { x: this.x + 1, y: this.y - 1 };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
						(() => {
							const position = { x: this.x - 1, y: this.y };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
						(() => {
							const position = { x: this.x + 1, y: this.y };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
						(() => {
							const position = { x: this.x - 1, y: this.y + 1 };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
						(() => {
							const position = { x: this.x, y: this.y + 1 };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
						(() => {
							const position = { x: this.x + 1, y: this.y + 1 };
							return exists(position) ? map[cellKeys[position.y][position.x]] : null;
						})(),
					];
					const blocked = surround.map(
						(maybeCell) => maybeCell === null || maybeCell.scrapAmount === 0 || maybeCell.recycler
					);
					// Match the first blocking pattern which check all angles that would block an open passage
					this._isBlocking = !!blockingChecks.find((blockCheck) => {
						return (
							blockCheck.open.every((i) => !blocked[i]) &&
							!!blockCheck.open.find(
								(i) => surround[i] !== null && surround[i]!.owner === Owner.Opponent
							) &&
							!!blockCheck.closed.find((list) => list.every((i) => blocked[i]))
						);
					});
				}
				return this._isBlocking;
			},
			_reach: {},
			reach(ignore: Cell, maxDepth: number) {
				if (!this._reach[cellKeys[this.y][this.x]]?.[cellKeys[ignore.y][ignore.x]]) {
					if (!this._reach[cellKeys[this.y][this.x]]) {
						this._reach[cellKeys[this.y][this.x]] = {};
					}
					const explored: { [key: symbol]: boolean } = {
						[cellKeys[this.y][this.x]]: true,
						[cellKeys[ignore.y][ignore.x]]: true,
					};
					const queue: ScoredCell[] = [{ cell: this, score: 0 }];
					let reachable = 0;
					while (queue.length > 0) {
						const node = queue.splice(0, 1)[0];
						if (node.score >= maxDepth) {
							continue;
						}
						const neighbors = this.neighbors.filter(
							(neighbor) => neighbor.scrapAmount > 0 && !neighbor.recycler && !neighbor.willDestruct
						);
						for (const neighbor of neighbors) {
							reachable += 1;
							const neighborKey = cellKeys[neighbor.y][neighbor.x];
							if (!explored[neighborKey]) {
								explored[neighborKey] = true;
								queue.push({ cell: neighbor, score: node.score + 1 });
							}
						}
					}
					this._reach[cellKeys[this.y][this.x]][cellKeys[ignore.y][ignore.x]] = reachable;
				}
				return this._reach[cellKeys[this.y][this.x]][cellKeys[ignore.y][ignore.x]];
			},
			distanceTo(cell: Cell) {
				return Math.abs(this.x - cell.x) + Math.abs(this.y - cell.y);
			},
		};
		cellKeys[y][x] = key;
	}
}

// Turn loop
let round = 0;
let side: Side;
let blockedMap = false;
while (true) {
	const times = {
		total: Date.now(),
	};

	// * Parse
	const inputs: string[] = readline().split(" ");
	let myMatter = Number(inputs[0]);
	const opponentMatter = Number(inputs[1]);
	const ownedCells: Cell[] = [];
	let selfRealOwnedCells = 0;
	const opponentCells: Cell[] = [];
	let opponentRealOwnedCells = 0;
	const freeCells: Cell[] = [];
	const selfRobotCells: Cell[] = [];
	const opponentRobotCells: Cell[] = [];
	let ownedRecyclers = 0;
	let opponentRecyclers = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const inputs: string[] = readline().split(" ");
			const scrapAmount = Number(inputs[0]);
			const owner: Owner = Number(inputs[1]); // 1 = self, 0 = foe, -1 = neutral
			const units = Number(inputs[2]);
			const recycler = Number(inputs[3]) > 0;
			const canBuild = Number(inputs[4]) > 0;
			const canSpawn = Number(inputs[5]) > 0;
			const inRangeOfRecycler = Number(inputs[6]) > 0;
			const willDestruct = inRangeOfRecycler && scrapAmount === 1;
			const cell = map[cellKeys[y][x]];
			cell.scrapAmount = scrapAmount;
			cell.owner = owner;
			cell.units = units;
			cell.recycler = recycler;
			cell.canBuild = canBuild;
			cell.canSpawn = canSpawn;
			cell.canMove = scrapAmount > 0 && !recycler;
			cell.inRangeOfRecycler = inRangeOfRecycler;
			cell.willDestruct = willDestruct;
			cell.movingUnits = 0;
			cell.hasAction = false;
			cell._closestEnemy = null;
			cell._closestEmptyCell = null;
			cell._threat = null;
			cell._isBlocking = null;
			if (owner === Owner.Self) {
				if (recycler) {
					ownedRecyclers += 1;
				}
				if (!willDestruct) {
					ownedCells.push(cell);
					selfRealOwnedCells += 1;
				}
				if (units > 0) {
					selfRobotCells.push(cell);
				}
			} else if (owner === Owner.Opponent) {
				if (recycler) {
					opponentRecyclers += 1;
				}
				if (!willDestruct) {
					opponentCells.push(cell);
					opponentRealOwnedCells += 1;
				}
				if (units > 0) {
					opponentRobotCells.push(cell);
				}
			} else {
				freeCells.push(cell);
			}
		}
	}

	// * First round setup
	if (round === 0) {
		// Find which side we're own to update directions priorities
		if (ownedCells[0].x < width / 2) {
			side = Side.Left;
			if (ownedCells[0].y < height / 2) {
				directions = [
					{ x: 0, y: -1 },
					{ x: 0, y: 1 },
					{ x: 1, y: 0 },
					{ x: -1, y: 0 },
				];
			} else {
				directions = [
					{ x: 0, y: 1 },
					{ x: 0, y: -1 },
					{ x: 1, y: 0 },
					{ x: -1, y: 0 },
				];
			}
		} else {
			side = Side.Right;
			if (ownedCells[0].y < height / 2) {
				directions = [
					{ x: 0, y: -1 },
					{ x: 0, y: 1 },
					{ x: -1, y: 0 },
					{ x: 1, y: 0 },
				];
			} else {
				directions = [
					{ x: 0, y: 1 },
					{ x: 0, y: -1 },
					{ x: -1, y: 0 },
					{ x: 1, y: 0 },
				];
			}
		}
		// Calculate fixed neighbors
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const cellKey = cellKeys[y][x];
				const neighbors = [];
				for (let d = 0; d < 4; d++) {
					const neighborPosition: Position = { x: x + directions[d].x, y: y + directions[d].y };
					if (
						exists(neighborPosition) &&
						map[cellKeys[neighborPosition.y][neighborPosition.x]].scrapAmount > 0
					) {
						neighbors.push(map[cellKeys[neighborPosition.y][neighborPosition.x]]);
					}
				}
				map[cellKey].neighbors = neighbors;
			}
		}
	}

	// * Process
	const actions: string[] = [];
	// ? Attack and defend
	// Analyze the battlefield to destroy opponent robots or protect a cell
	const opponentRobotNodes = opponentRobotCells
		.filter((robot) => robot.neighbors.find((neighbor) => neighbor.owner === Owner.Self && !neighbor.recycler))
		.sort((a, b) => b.units - a.units);
	if (opponentRobotNodes.length > 0) {
		for (const opponentRobot of opponentRobotNodes) {
			// Destroy the cell if there is enough robots around it to destroy and capture it
			if (opponentRobot.attackPower() > opponentRobot.threat()) {
				const neighborRobots = opponentRobot.neighbors
					.filter((neighbor) => neighbor.owner === Owner.Self && neighbor.units > 0)
					.sort((a, b) => b.units - a.units);
				let toKill = opponentRobot.threat() + 1;
				for (let i = 0; toKill > 0 && i < neighborRobots.length; i++) {
					const neighbor = neighborRobots[i];
					const amount = Math.min(neighbor.units, toKill);
					actions.push(neighbor.move(opponentRobot, amount));
					toKill -= amount;
				}
			}
		}
	}
	// Handle border cells that have threat
	const robotNodes = selfRobotCells
		.filter(
			(robot) =>
				robot.units > 0 &&
				!robot.hasAction &&
				robot.neighbors.find((neighbor) => neighbor.owner === Owner.Opponent && neighbor.units > 0)
		)
		.sort((a, b) => b.threat() - a.threat());
	for (let i = 0; i < robotNodes.length; i++) {
		const robotNode = robotNodes[i];
		const opponentNeighbors = robotNode.neighbors.filter(
			(neighbor) => neighbor.owner === Owner.Opponent && neighbor.units > 0
		);
		// Settle equal threat with peace
		if (opponentNeighbors.length === 1) {
			const opponent = opponentNeighbors[0];
			if (opponent.threat() === robotNode.support()) {
				robotNode.hasAction = true;
			} else if (robotNode.threat() >= robotNode.support()) {
				const toSpawn = robotNode.threat() - robotNode.support();
				if (myMatter >= toSpawn * 10) {
					actions.push(robotNode.spawn(toSpawn));
					myMatter -= toSpawn * 10;
				} else {
					const safeEscape = robotNode.neighbors.find(
						(neighbor) => neighbor.owner !== Owner.Opponent || neighbor.units < robotNode.units
					);
					if (safeEscape) {
						actions.push(robotNode.move(safeEscape, robotNode.units));
					} else {
						robotNode.hasAction = true;
					}
				}
			}
		} // If there is multiple opponents, do something ?
		else {
			if (robotNode.threat() === robotNode.support()) {
				robotNode.hasAction = true;
			} else if (robotNode.threat() >= robotNode.support()) {
				const toSpawn = robotNode.threat() - robotNode.support();
				if (myMatter >= toSpawn * 10) {
					actions.push(robotNode.spawn(toSpawn));
					myMatter -= toSpawn * 10;
				} else {
					const safeEscape = robotNode.neighbors.find(
						(neighbor) => neighbor.owner !== Owner.Opponent || neighbor.units < robotNode.units
					);
					if (safeEscape) {
						actions.push(robotNode.move(safeEscape, robotNode.units));
					} else {
						robotNode.hasAction = true;
					}
				}
			}
		}
	}
	// ? Block
	// If a cell block a single cell passage, close it to reduce the rogue possibilities
	if (myMatter >= 10) {
		const blockBorderCells = ownedCells
			.filter(
				(cell) =>
					cell.canBuild &&
					cell.closestEnemy() !== null &&
					cell.neighbors.find(
						(neighbor) => neighbor.owner !== Owner.Self && !neighbor.willDestruct && !neighbor.recycler
					)
			)
			.sort((a, b) => b.units - a.units);
		for (let i = 0; myMatter >= 10 && i < blockBorderCells.length; i++) {
			const borderCell = blockBorderCells[i];
			if (borderCell.isBlocking()) {
				actions.push(borderCell.buildRecycler());
				myMatter -= 10;
			}
		}
	}
	// ? Explore
	// Select border cells and assign the closest robots to them, prioritizing spread in the direction of the opponent
	const added: CellHashSet = {};
	let outerBorderCells = [];
	for (const cell of ownedCells) {
		if (cell.closestEnemy() !== null) {
			outerBorderCells.push(
				...cell.neighbors.filter((neighbor) => {
					const inBorder =
						!added[cellKeys[neighbor.y][neighbor.x]] &&
						neighbor.owner !== Owner.Self &&
						neighbor.canMove &&
						!neighbor.willDestruct &&
						!neighbor.recycler &&
						neighbor.scrapAmount > 0 &&
						neighbor.closestEnemy() !== null;
					if (inBorder) {
						added[cellKeys[neighbor.y][neighbor.x]] = true;
					}
					return inBorder;
				})
			);
		}
	}
	outerBorderCells = outerBorderCells.sort((a, b) => a.closestEnemy()!.score - b.closestEnemy()!.score);
	// Assign the closest outer border cells for each available robots
	/* const availableRobots = selfRobotCells.filter((cell) => cell.units > 0);
	for (let i = 0; outerBorderCells.length > 0 && i < availableRobots.length; i++) {
		const cell = availableRobots[i];
		const outerBorderDestination = outerBorderCells.sort((a, b) => a.distanceTo(cell) - b.distanceTo(cell))[0];
		const fromNeighbor = cell.neighbors.sort(prioritizeSpreadToCell(outerBorderDestination))[0];
		actions.push(cell.move(fromNeighbor, 1));
		const outerBorderIndex = outerBorderCells.findIndex(
			(cell) => cell.x === outerBorderDestination.x && cell.y === outerBorderDestination.y
		);
		outerBorderCells.splice(outerBorderIndex, 1);
	} */
	// Assign the closest robot for each outer border cells
	while (outerBorderCells.length > 0) {
		const cell = outerBorderCells.shift()!;
		const closestRobot = dfs(cell, ownedAvailableRobot);
		if (closestRobot) {
			const fromNeighbor = closestRobot.cell.neighbors.sort(prioritizeSpreadToCell(cell))[0];
			actions.push(closestRobot.cell.move(fromNeighbor, 1));
		} else {
			// Out of robots to use
			break;
		}
	}
	// ? Move closed robots
	// Robots that can't reach any opponent cell should just wander and finish conquering what's available
	const closedRobots = selfRobotCells
		.filter((robot) => robot.units > 0 && robot.closestEnemy() === null && robot.closestEmptyCell() !== null)
		.sort((a, b) => a.closestEmptyCell()!.score - b.closestEmptyCell()!.score);
	for (let i = 0; i < closedRobots.length; i++) {
		const robotNode = closedRobots[i];
		actions.push(robotNode.move(robotNode.closestEmptyCell()!.cell, 1));
	}
	// ? Farm
	if (myMatter >= 10 && ownedRecyclers < 3 && ownedRecyclers <= opponentRecyclers) {
		const cells = mostProfitableRecyclerCells(ownedCells);
		if (cells.length > 0) {
			const cell = cells[0].cell;
			actions.push(cell.buildRecycler());
			myMatter -= 10;
		}
	}
	// ? Spawn
	// Find unassigned outer border cells and spawn to the best and nearest owned cell
	if (myMatter >= 10 && selfRobotCells.length < exploreSpawnLimit) {
		// The cells are still sorted by their distance to the closest opponent cell
		// -- and outerBorderCells only has unassigned outer border cells since they're removed on use
		let availableRobots = selfRobotCells.length;
		for (
			let i = 0;
			myMatter >= 10 && availableRobots < exploreSpawnLimit && i < outerBorderCells.slice().length;
			i++
		) {
			const cell = outerBorderCells[i];
			const closestOwned = dfs(cell, ownedSpawnable);
			if (closestOwned) {
				actions.push(closestOwned.cell.spawn(1));
				myMatter -= 10;
				availableRobots += 1;
			} else {
				break;
			}
		}
	}
	if (myMatter >= 50) {
		const closedCells = ownedCells
			.filter((cell) => cell.closestEnemy() === null && cell.closestEmptyCell() !== null)
			.sort((a, b) => a.closestEmptyCell()!.score - b.closestEmptyCell()!.score);
		if (closedCells.length > 0) {
			actions.push(closedCells[0].spawn(1));
			myMatter -= 10;
		}
	}

	// * Done
	/***/ times.total = Date.now() - times.total;
	actions.unshift(`MESSAGE ${times.total}`);
	if (actions.length > 1) {
		console.log(`${actions.join(";")}`);
	} else {
		console.log(`${actions.join(";")};WAIT`);
	}

	round += 1;
}
