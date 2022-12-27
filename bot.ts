// * Dependencies

class BinaryHeap {
	content: Tile[];
	scores: TileScoreSet;

	constructor() {
		this.content = [];
		this.scores = {};
	}

	scoreFunction(tile: Tile) {
		if (this.scores[key(tile)]) {
			return this.scores[key(tile)];
		}
		return +Infinity;
	}

	push(element: Tile, score: number) {
		// Add the new element to the end of the array.
		this.content.push(element);
		this.scores[key(element)] = score;

		// Allow it to sink down.
		this.sinkDown(this.content.length - 1);
	}

	pop() {
		// Store the first element so we can return it later.
		var result = this.content[0];
		// Get the element at the end of the array.
		var end = this.content.pop()!;
		// If there are any elements left, put the end element at the
		// start, and let it bubble up.
		if (this.content.length > 0) {
			this.content[0] = end;
			this.bubbleUp(0);
		}
		return result;
	}

	remove(node: Tile) {
		var i = this.content.indexOf(node);

		// When it is found, the process seen in 'pop' is repeated
		// to fill up the hole.
		var end = this.content.pop()!;

		if (i !== this.content.length - 1) {
			this.content[i] = end;

			if (this.scoreFunction(end) < this.scoreFunction(node)) {
				this.sinkDown(i);
			} else {
				this.bubbleUp(i);
			}
		}
	}

	size() {
		return this.content.length;
	}

	rescoreElement(node: Tile) {
		this.sinkDown(this.content.indexOf(node));
	}

	sinkDown(n: number) {
		// Fetch the element that has to be sunk.
		var element = this.content[n];

		// When at 0, an element can not sink any further.
		while (n > 0) {
			// Compute the parent element's index, and fetch it.
			var parentN = ((n + 1) >> 1) - 1;
			var parent = this.content[parentN];
			// Swap the elements if the parent is greater.
			if (this.scoreFunction(element) < this.scoreFunction(parent)) {
				this.content[parentN] = element;
				this.content[n] = parent;
				// Update 'n' to continue at the new position.
				n = parentN;
			}
			// Found a parent that is less, no need to sink any further.
			else {
				break;
			}
		}
	}

	bubbleUp(n: number) {
		// Look up the target element and its score.
		var length = this.content.length;
		var element = this.content[n];
		var elemScore = this.scoreFunction(element);

		while (true) {
			// Compute the indices of the child elements.
			var child2N = (n + 1) << 1;
			var child1N = child2N - 1;
			// This is used to store the new position of the element, if any.
			var swap = null;
			var child1Score = Infinity;
			// If the first child exists (is inside the array)...
			if (child1N < length) {
				// Look it up and compute its score.
				var child1 = this.content[child1N];
				child1Score = this.scoreFunction(child1);

				// If the score is less than our element's, we need to swap.
				if (child1Score < elemScore) {
					swap = child1N;
				}
			}

			// Do the same checks for the other child.
			if (child2N < length) {
				var child2 = this.content[child2N];
				var child2Score = this.scoreFunction(child2);
				if (child2Score < (swap === null ? elemScore : child1Score)) {
					swap = child2N;
				}
			}

			// If the element needs to be moved, swap it, and continue.
			if (swap !== null) {
				this.content[n] = this.content[swap];
				this.content[swap] = element;
				n = swap;
			}
			// Otherwise, we are done.
			else {
				break;
			}
		}
	}
}

// * Global utility

enum Owner {
	Neutral = -1,
	Foe = 0,
	Self = 1,
}

enum Side {
	Left,
	Right,
}

type Tile = {
	x: number;
	y: number;
	scrapAmount: number;
	units: number;
	recycler: boolean;
	canBuild: boolean;
	canSpawn: boolean;
	inRangeOfRecycler: boolean;
	owner: Owner;
	blocked: boolean;
	movingUnits: number;
	hasAction: boolean;
	neighbors: () => Tile[];
};
type TileMap = Tile[][];
type TileSet = { [key: symbol]: Tile };
type TileScoreSet = { [key: symbol]: number };
type Position = [number, number];
type TileCloseMap = { [key: number]: { [key: number]: boolean } };

type CloseTileSummary = {
	enemyRobotsAmount: number;
	selfRobotsAmount: number;
	enemyTilesAmount: number;
	selfTilesAmount: number;
	unownedTiles: number;
	foeOrUnownedTiles: number;
	blocking: boolean;
};

const tileKeys: { [key: number]: { [key: number]: symbol } } = {};
let xLimit = 0;
let yLimit = 0;

function exists(position: Position) {
	return position[0] >= 0 && position[1] >= 0 && position[0] < xLimit && position[1] < yLimit;
}

function key(tile: { x: number; y: number }): symbol {
	return tileKeys[tile.x][tile.y];
}

let directions = [
	[-1, 0],
	[0, -1],
	[1, 0],
	[0, 1],
];

const angles = [
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1],
];

const blockingChecks = [
	[
		[-1, -1],
		[1, -1],
	],
	[
		[-1, -1],
		[1, 0],
	],
	[
		[-1, -1],
		[1, 1],
	],
	[
		[-1, 0],
		[1, -1],
	],
	[
		[-1, 0],
		[1, 0],
	],
	[
		[-1, 0],
		[1, 1],
	],
	[
		[-1, 1],
		[1, -1],
	],
	[
		[-1, 1],
		[1, 0],
	],
	[
		[-1, 1],
		[1, 1],
	],
];

function aStar(map: TileMap, start: Tile, goal: (tile: Tile) => boolean) {
	const startKey = key(start);
	const openSet = new BinaryHeap();
	openSet.push(start, 0);
	const cameFrom: TileSet = {};
	const gScore: TileScoreSet = { [startKey]: 0 };

	while (openSet.size() > 0) {
		const node = openSet.pop();
		const useKey = key(node);
		if (goal(node)) {
			return node;
		}

		const neighbors = directions
			.map((d): Position => [node.x + d[0], node.y + d[1]])
			.filter((p) => exists(p) && !map[p[0]][p[1]].blocked)
			.map((p) => map[p[0]][p[1]]);
		for (const neighbor of neighbors) {
			const neighborKey = key(neighbor);
			const score = gScore[useKey] + 1;
			if (gScore[neighborKey] === undefined || score < gScore[neighborKey]) {
				cameFrom[neighborKey] = node;
				gScore[neighborKey] = score;
				openSet.push(neighbor, score + 1);
			}
		}
	}

	return null;
}

function bfs(map: TileMap, start: Tile, goal: (tile: Tile) => boolean) {
	const explored: { [key: symbol]: boolean } = { [key(start)]: true };
	const queue: Tile[] = [start];

	while (queue.length > 0) {
		const node = queue.splice(0, 1)[0];
		if (goal(node)) {
			return node;
		}
		const neighborPositions = directions
			.map((d): Position => [node.x + d[0], node.y + d[1]])
			.filter((p) => exists(p) && !map[p[0]][p[1]].blocked);
		for (const [x, y] of neighborPositions) {
			const neighbor = map[x][y];
			const neighborKey = key(neighbor);
			if (!explored[neighborKey]) {
				explored[neighborKey] = true;
				queue.push(neighbor);
			}
		}
	}

	return null;
}

function closestEnemyCondition(node: Tile) {
	return node.owner === Owner.Foe && !node.hasAction;
}

function closestAllyCondition(node: Tile) {
	return node.owner === Owner.Self;
}

function unownedTileCondition(node: Tile) {
	return node.owner !== Owner.Self && !node.hasAction;
}

function unownedEmptyTileCondition(node: Tile) {
	return node.owner !== Owner.Self && node.movingUnits < 1;
}

function reachGoalCondition(goal: Tile) {
	return (node: Tile) => {
		return node.x === goal.x && node.y === goal.y;
	};
}

// * Map utility

function furthestVerticalTile(map: TileMap, tile: Tile): Tile | null {
	let furthestTile = null;
	let length = 0;
	let x = tile.x;
	let offset = 0;
	while (x > 0) {
		if (!map[x][tile.y].blocked) {
			furthestTile = map[x][tile.y];
			length = offset;
		}
		x -= 1;
		offset += 1;
	}
	x = tile.x;
	offset = 0;
	while (x < map.length) {
		if (!map[x][tile.y].blocked && offset > length) {
			furthestTile = map[x][tile.y];
			length = offset;
		}
		x += 1;
		offset += 1;
	}
	return furthestTile;
}

function adjacentMovableTiles(map: TileMap, tile: Tile) {
	let tiles = [];
	for (const direction of directions) {
		const position: Position = [tile.x + direction[0], tile.y + direction[1]];
		if (exists(position)) {
			const neighborTile = map[position[0]][position[1]];
			if (!neighborTile.blocked && neighborTile.owner !== Owner.Self) {
				tiles.push(map[position[0]][position[1]]);
			}
		}
	}
	return tiles;
}

const leftCheck = [
	[-1, -1],
	[0, -1],
	[1, -1],
];
const rightCheck = [
	[-1, 1],
	[0, 1],
	[1, 1],
];
function tileIsBlocking(map: TileMap, tile: Tile, against: Position) {
	if (against[0] < tile.x) {
		for (let i = -1; i <= 1; i++) {
			const position: Position = [tile.x + 1, tile.y + i];
			if (!exists(position) || map[position[0]][position[1]].blocked) {
				return true;
			}
		}
	} else if (against[0] === tile.x) {
		if (against[1] < tile.y) {
			for (let i = 0; i < 3; i++) {
				const position: Position = [tile.x + rightCheck[i][0], tile.y + rightCheck[i][1]];
				if (!exists(position) || map[position[0]][position[1]].blocked) {
					return true;
				}
			}
		} else {
			for (let i = 0; i < 3; i++) {
				const position: Position = [tile.x + leftCheck[i][0], tile.y + leftCheck[i][1]];
				if (!exists(position) || map[position[0]][position[1]].blocked) {
					return true;
				}
			}
		}
	} else {
		for (let i = -1; i <= 1; i++) {
			const position: Position = [tile.x - 1, tile.y + i];
			if (!exists(position) || map[position[0]][position[1]].blocked) {
				return true;
			}
		}
	}
	return false;
}

function closeTileSummary(map: TileMap, tile: Tile, range: number): CloseTileSummary {
	const summary: CloseTileSummary = {
		selfRobotsAmount: 0,
		enemyRobotsAmount: 0,
		selfTilesAmount: 0,
		enemyTilesAmount: 0,
		unownedTiles: 0,
		foeOrUnownedTiles: 0,
		blocking: false,
	};
	for (let i = tile.x - range; i <= tile.x + range; i++) {
		if (i < 0 || i > xLimit - 1) {
			continue;
		}
		for (let j = tile.y - range; j <= tile.y + range; j++) {
			if (j < 0 || j > yLimit - 1) {
				continue;
			}
			const closeTile = map[i][j];
			if (closeTile.blocked) {
				summary.blocking = summary.blocking || tileIsBlocking(map, tile, [i, j]);
				continue;
			}
			if (closeTile.owner === Owner.Self) {
				summary.selfRobotsAmount += closeTile.units;
				summary.selfTilesAmount += 1;
			} else if (closeTile.owner === Owner.Foe) {
				summary.enemyRobotsAmount += closeTile.units;
				summary.enemyTilesAmount += 1;
				summary.foeOrUnownedTiles += 1;
			} else {
				summary.unownedTiles += 1;
			}
		}
	}
	summary.blocking =
		summary.blocking &&
		((exists([tile.x - 1, tile.y]) &&
			exists([tile.x + 1, tile.y]) &&
			!map[tile.x - 1][tile.y].blocked &&
			!map[tile.x + 1][tile.y].blocked) ||
			(exists([tile.x, tile.y - 1]) &&
				exists([tile.x, tile.y + 1]) &&
				!map[tile.x][tile.y - 1].blocked &&
				!map[tile.x][tile.y + 1].blocked));
	return summary;
}

function mostProfitableRecyclerTile(map: TileMap, ownedTiles: Position[]): Tile | null {
	let mostProfitableTile: Tile | null = null;
	for (const ownedTile of ownedTiles) {
		const tile = map[ownedTile[0]][ownedTile[1]];
		if (!tile.canBuild || tile.hasAction) {
			continue;
		}
		if (
			tile.neighbors().every((n) => !n.blocked && n.scrapAmount > tile.scrapAmount) &&
			(!mostProfitableTile || mostProfitableTile.scrapAmount < tile.scrapAmount)
		) {
			mostProfitableTile = tile;
		}
	}
	return mostProfitableTile;
}

function adjacentTilesSummary(map: TileMap, tile: Tile): CloseTileSummary {
	const summary: CloseTileSummary = {
		selfRobotsAmount: 0,
		enemyRobotsAmount: 0,
		selfTilesAmount: 0,
		enemyTilesAmount: 0,
		unownedTiles: 0,
		foeOrUnownedTiles: 0,
		blocking:
			((!exists([tile.x - 1, tile.y]) || map[tile.x - 1][tile.y].blocked) &&
				(!exists([tile.x + 1, tile.y]) || map[tile.x + 1][tile.y].blocked)) ||
			((!exists([tile.x, tile.y - 1]) || map[tile.x][tile.y - 1].blocked) &&
				(!exists([tile.x, tile.y + 1]) || map[tile.x][tile.y + 1].blocked)),
	};
	const tiles = adjacentMovableTiles(map, tile);
	for (const tile of tiles) {
		if (tile.blocked) {
			continue;
		}
		if (tile.owner === Owner.Self) {
			summary.selfRobotsAmount += tile.units;
			summary.selfTilesAmount += 1;
		} else if (tile.owner === Owner.Foe) {
			summary.enemyRobotsAmount += tile.units;
			summary.enemyTilesAmount += 1;
			summary.foeOrUnownedTiles += 1;
		} else {
			summary.unownedTiles += 1;
		}
	}
	return summary;
}

function mostProfitableSpawnTiles(map: TileMap, ownedTiles: Position[]): Tile[] {
	let tiles: [Tile, number][] = [];
	for (const position of ownedTiles) {
		const tile = map[position[0]][position[1]];
		if (tile.blocked || tile.hasAction) {
			continue;
		}
		const summary = adjacentTilesSummary(map, tile);
		let score = summary.enemyTilesAmount * 15 + summary.unownedTiles * 10 - summary.selfRobotsAmount * 10;
		if (score < 10) {
			continue;
		}
		for (const angle of angles) {
			const position: Position = [tile.x + angle[0], tile.y + angle[1]];
			if (exists(position)) {
				const angleTile = map[position[0]][position[1]];
				if (angleTile.owner === Owner.Foe) {
					score += 4;
				} else if (angleTile.owner === Owner.Neutral) {
					score += 2;
				} else {
					score -= angleTile.units;
				}
				if (angleTile.hasAction) {
					score -= 10;
				}
			}
		}
		let inserted = false;
		for (let index = 0; index < tiles.length; index++) {
			if (tiles[index][1] < score) {
				inserted = true;
				tiles.splice(index, 0, [tile, score]);
				break;
			}
		}
		if (!inserted) {
			tiles.push([tile, score]);
		}
	}
	return tiles.map(([tile, _]) => tile);
}

// * Bot

const inputs: string[] = readline().split(" ");
const width: number = parseInt(inputs[0]);
yLimit = width;
const height: number = parseInt(inputs[1]);
xLimit = height;

// Calculate tileKeys
for (let i = 0; i < height; i++) {
	tileKeys[i] = {};
	for (let j = 0; j < width; j++) {
		tileKeys[i][j] = Symbol();
	}
}

// Turn loop
let round = 1;
let side: Side;
while (true) {
	const roundStart = Date.now();

	// * Parse
	const inputs: string[] = readline().split(" ");
	let myMatter: number = parseInt(inputs[0]);
	const oppMatter: number = parseInt(inputs[1]);
	const map: TileMap = [];
	const ownedTiles: Position[] = [];
	const foeTiles: Position[] = [];
	const freeTiles: Position[] = [];
	const selfRobotTiles: Position[] = [];
	const foeRobotTiles: Position[] = [];
	let recyclers = 0;
	// Input
	for (let i = 0; i < height; i++) {
		const row: Tile[] = [];
		for (let j = 0; j < width; j++) {
			const inputs: string[] = readline().split(" ");
			const scrapAmount: number = parseInt(inputs[0]);
			const owner: Owner = parseInt(inputs[1]); // 1 = self, 0 = foe, -1 = neutral
			const units: number = parseInt(inputs[2]);
			const recycler = parseInt(inputs[3]) > 0;
			const canBuild = parseInt(inputs[4]) > 0;
			const canSpawn = parseInt(inputs[5]) > 0;
			const inRangeOfRecycler = parseInt(inputs[6]) > 0;
			row.push({
				x: i,
				y: j,
				scrapAmount,
				owner,
				units,
				recycler,
				canBuild,
				canSpawn,
				inRangeOfRecycler,
				blocked: scrapAmount === 0 || recycler,
				movingUnits: 0,
				hasAction: false,
				neighbors() {
					const neighbors = [];
					for (let d = 0; d < 4; d++) {
						const neighborTilePosition: Position = [this.x + directions[d][0], this.y + directions[d][1]];
						if (exists(neighborTilePosition)) {
							neighbors.push(map[neighborTilePosition[0]][neighborTilePosition[1]]);
						}
					}
					return neighbors;
				},
			});
			if (owner === Owner.Self) {
				ownedTiles.push([i, j]);
			} else if (owner === Owner.Foe) {
				foeTiles.push([i, j]);
			} else {
				freeTiles.push([i, j]);
			}
			if (recycler) {
				recyclers += 1;
			}
			if (units > 0) {
				if (owner === Owner.Self) {
					selfRobotTiles.push([i, j]);
				} else {
					foeRobotTiles.push([i, j]);
				}
			}
		}
		map.push(row);
	}
	// Find which side we're on on the first round
	if (round === 1) {
		if (map[ownedTiles[0][0]][ownedTiles[0][1]].y < width / 2) {
			side = Side.Left;
			directions = [
				[0, 1],
				[-1, 0],
				[0, -1],
				[1, 0],
			];
		} else {
			side = Side.Right;
			directions = [
				[0, -1],
				[-1, 0],
				[0, 1],
				[1, 0],
			];
		}
	}

	// * Process
	const action: string[] = [];
	// ? Defend tiles under threat or with a lot of free estate
	for (const selfTilePosition of ownedTiles) {
		const tile = map[selfTilePosition[0]][selfTilePosition[1]];
		if (tile.hasAction) {
			continue;
		}
		if (tile.canSpawn || tile.canBuild) {
			let underThreat = 0;
			for (const neighbor of tile.neighbors()) {
				if (neighbor.owner === Owner.Foe && neighbor.units > tile.units) {
					underThreat = neighbor.units - tile.units + 1;
					break;
				}
			}
			if (underThreat > 3 && tile.canBuild) {
				action.push(`BUILD ${tile.y} ${tile.x}`);
				tile.hasAction = true;
				tile.recycler = true;
			} else if (underThreat > 0 && tile.canBuild && myMatter >= underThreat * 10) {
				action.push(`SPAWN ${underThreat} ${tile.y} ${tile.x}`);
				myMatter -= underThreat * 10;
				tile.hasAction = true;
				tile.movingUnits += underThreat;
			}
		}
	}
	// ? Farm resources
	if (round > 2 && round < 15 && recyclers < 5) {
		const tile = mostProfitableRecyclerTile(map, ownedTiles);
		if (tile && tile.scrapAmount > 2) {
			action.push(`BUILD ${tile.y} ${tile.x}`);
			tile.hasAction = true;
			tile.recycler = true;
			tile.blocked = true;
		}
	}
	// ? Close spaces
	else if (round >= 15) {
		for (const selfTilePosition of ownedTiles) {
			const tile = map[selfTilePosition[0]][selfTilePosition[1]];
			if (tile.hasAction) {
				continue;
			}
			if (tile.canBuild) {
				const summary = closeTileSummary(map, tile, 1);
				if (summary.blocking && summary.selfTilesAmount < summary.enemyTilesAmount) {
					tile.hasAction = true;
					tile.recycler = true;
					tile.blocked = true;
					action.push(`BUILD ${tile.y} ${tile.x}`);
				}
			}
		}
	}
	// ? Move robots to control, defend or attack
	for (const selfUnit of selfRobotTiles) {
		const unitTile = map[selfUnit[0]][selfUnit[1]];
		if (unitTile.hasAction) {
			continue;
		}
		// * Defend
		// TODO Don't move if under threat
		// * Move
		const closestUnowned = bfs(map, unitTile, unownedTileCondition);
		if (closestUnowned) {
			const destination = closestUnowned;
			destination.movingUnits += 1;
			destination.hasAction = true;
			action.push(
				`MOVE ${Math.ceil(unitTile.units / 2)} ${unitTile.y} ${unitTile.x} ${destination.y} ${destination.x}`
			);
			continue;
		}
		/*const vertical = furthestVerticalTile(map, unitTile);
		if (vertical) {
			vertical.movingUnits += 1;
			vertical.hasAction = true;
			action.push(
				`MOVE ${Math.ceil(unitTile.units / 2)} ${unitTile.y} ${unitTile.x} ${vertical.y} ${vertical.x}`
			);
			continue;
		}*/
		const closestEnemyTile = bfs(map, unitTile, closestEnemyCondition);
		if (closestEnemyTile) {
			const destination = closestEnemyTile;
			destination.movingUnits += 1;
			destination.hasAction = true;
			action.push(
				`MOVE ${Math.ceil(unitTile.units / 2)} ${unitTile.y} ${unitTile.x} ${destination.y} ${destination.x}`
			);
			continue;
		}
	}
	// ? Find the most profitable cells to spawn new robots on
	if (myMatter >= 20) {
		const mostProfitable = mostProfitableSpawnTiles(map, ownedTiles);
		for (const tile of mostProfitable) {
			action.push(`SPAWN 1 ${tile.y} ${tile.x}`);
			myMatter -= 10;
			if (myMatter < 20) {
				break;
			}
		}
	}

	if (action.length > 0) {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;${action.join(";")}`);
	} else {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;WAIT`);
	}

	round += 1;
}
