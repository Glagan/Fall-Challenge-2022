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
	willDestruct: boolean;
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
	[1, 0],
	[0, -1],
	[-1, 0],
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

function bfs(map: TileMap, start: Tile, goal: (start: Tile, target: Tile) => boolean) {
	const explored: { [key: symbol]: boolean } = { [key(start)]: true };
	const queue: Tile[] = [];
	for (const neighborPosition of directions.map((d): Position => [start.x + d[0], start.y + d[1]])) {
		if (exists(neighborPosition) && !map[neighborPosition[0]][neighborPosition[1]].blocked) {
			queue.push(map[neighborPosition[0]][neighborPosition[1]]);
		}
	}

	while (queue.length > 0) {
		const node = queue.splice(0, 1)[0];
		if (goal(start, node)) {
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

function unownedTileCondition(start: Tile, target: Tile) {
	return (
		target.owner !== Owner.Self &&
		(target.owner !== Owner.Foe || start.units > target.units) &&
		!target.willDestruct &&
		!target.hasAction &&
		target.movingUnits === 0
	);
}

function reachGoalCondition(goal: Tile) {
	return (node: Tile) => {
		return node.x === goal.x && node.y === goal.y;
	};
}

// * Map utility

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

function mostProfitableRecyclerTile(map: TileMap, ownedTiles: Position[]) {
	return ownedTiles
		.map((ownedTile) => {
			const tile = map[ownedTile[0]][ownedTile[1]];
			if (!tile.canBuild || tile.hasAction) {
				return null;
			}
			const neighbors = tile.neighbors();
			if (neighbors.every((n) => !n.blocked && n.scrapAmount > tile.scrapAmount)) {
				return [tile, neighbors.length * 10 + tile.scrapAmount] as [Tile, number];
			}
			return null;
		})
		.filter((t) => t !== null)
		.sort((a, b) => b![1] - a![1]) as [Tile, number][];
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

function tileMoveReach(map: TileMap, tile: Tile, condition: (start: Tile, target: Tile) => boolean, depth: number) {
	const explored: { [key: symbol]: boolean } = { [key(tile)]: true };
	const queue: [tile: Tile, depth: number][] = [[tile, 0]];
	let reachable = 0;
	while (queue.length > 0) {
		const node = queue.splice(0, 1)[0];
		if (node[1] >= depth) {
			continue;
		}
		const neighborPositions = directions
			.map((d): Position => [node[0].x + d[0], node[0].y + d[1]])
			.filter((p) => exists(p) && !map[p[0]][p[1]].blocked);
		for (const [x, y] of neighborPositions) {
			const neighbor = map[x][y];
			if (condition(tile, neighbor)) {
				reachable += 1;
			}
			const neighborKey = key(neighbor);
			if (!explored[neighborKey]) {
				explored[neighborKey] = true;
				queue.push([neighbor, node[1] + 1]);
			}
		}
	}
	return reachable;
}

function tileNeighborsMoveReach(
	map: TileMap,
	tile: Tile,
	condition: (start: Tile, target: Tile) => boolean,
	depth: number
) {
	const neighbors: [Tile, number][] = [];
	for (const neighborPosition of directions.map((d): Position => [tile.x + d[0], tile.y + d[1]])) {
		if (exists(neighborPosition) && !map[neighborPosition[0]][neighborPosition[1]].blocked) {
			const neighbor = map[neighborPosition[0]][neighborPosition[1]];
			const explored: { [key: symbol]: boolean } = { [key(tile)]: true, [key(neighbor)]: true };
			const queue: [tile: Tile, depth: number][] = [[neighbor, 0]];
			let reachable = condition(tile, neighbor) ? 2 : 0;
			while (queue.length > 0) {
				const node = queue.splice(0, 1)[0];
				if (node[1] >= depth) {
					continue;
				}
				const neighborPositions = directions
					.map((d): Position => [node[0].x + d[0], node[0].y + d[1]])
					.filter((p) => exists(p) && !map[p[0]][p[1]].blocked);
				for (const [x, y] of neighborPositions) {
					const neighbor = map[x][y];
					if (condition(tile, neighbor)) {
						reachable += 1;
					}
					const neighborKey = key(neighbor);
					if (!explored[neighborKey]) {
						explored[neighborKey] = true;
						queue.push([neighbor, node[1] + 1]);
					}
				}
			}
			neighbors.push([neighbor, reachable] as [Tile, number]);
		}
	}
	return neighbors;
}

function mostProfitableSpawnTiles(map: TileMap, ownedTiles: Position[]) {
	return ownedTiles
		.map((position) => {
			const tile = map[position[0]][position[1]];
			if (tile.blocked || tile.recycler) {
				return null;
			}
			const reach = tileMoveReach(map, tile, unownedTileCondition, 2);
			const summary = closeTileSummary(map, tile, 1);
			const score =
				reach * 2 +
				summary.enemyTilesAmount * 20 +
				summary.unownedTiles * 10 -
				// summary.selfRobotsAmount * 10 -
				summary.enemyRobotsAmount * 8;
			return [tile, score] as [Tile, number];
		})
		.filter((t) => t !== null)
		.sort((a, b) => b![1] - a![1]) as [Tile, number][];
}

// * Bot

const inputs: string[] = readline().split(" ");
const width: number = parseInt(inputs[0]);
yLimit = width;
const height: number = parseInt(inputs[1]);
xLimit = height;
const moveDepth = width < 15 ? 2 : 6;

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
			const willDestruct = inRangeOfRecycler && scrapAmount === 1;
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
				blocked: scrapAmount === 0 || recycler || willDestruct,
				willDestruct,
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
				if (recycler) {
					recyclers += 1;
				}
				ownedTiles.push([i, j]);
			} else if (owner === Owner.Foe) {
				foeTiles.push([i, j]);
			} else {
				freeTiles.push([i, j]);
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
				[1, 0],
				[0, -1],
				[-1, 0],
			];
		} else {
			side = Side.Right;
			directions = [
				[0, -1],
				[1, 0],
				[0, 1],
				[-1, 0],
			];
		}
	}

	// * Process
	const action: string[] = [];
	// ? Defend tiles under threat or with a lot of free estate
	for (const selfTilePosition of ownedTiles) {
		const tile = map[selfTilePosition[0]][selfTilePosition[1]];
		if (tile.hasAction || (!tile.canSpawn && !tile.canBuild)) {
			continue;
		}
		let underThreat = 0;
		for (const neighbor of tile.neighbors()) {
			if (neighbor.owner === Owner.Foe && neighbor.units > tile.units) {
				underThreat = neighbor.units - tile.units + 1;
				break;
			}
		}
		if (underThreat >= 3 && tile.canBuild) {
			action.push(`BUILD ${tile.y} ${tile.x}`);
			tile.hasAction = true;
			tile.recycler = true;
			myMatter -= 10;
		} else if (underThreat > 0 && tile.canBuild && myMatter >= underThreat * 10) {
			action.push(`SPAWN ${underThreat} ${tile.y} ${tile.x}`);
			myMatter -= underThreat * 10;
			tile.hasAction = true;
			tile.movingUnits += underThreat;
		}
	}
	// ? Farm resources
	if (recyclers < 5) {
		const tiles = mostProfitableRecyclerTile(map, ownedTiles);
		if (tiles.length > 0 && tiles[0][0].scrapAmount > 3) {
			const tile = tiles[0][0];
			action.push(`BUILD ${tile.y} ${tile.x}`);
			tile.hasAction = true;
			tile.recycler = true;
			tile.blocked = true;
			myMatter -= 10;
		}
	}
	// ? Close space
	if (round >= 5) {
		for (const selfTilePosition of ownedTiles) {
			const tile = map[selfTilePosition[0]][selfTilePosition[1]];
			if (tile.hasAction || !tile.canBuild) {
				continue;
			}
			const summary = adjacentTilesSummary(map, tile);
			if (summary.enemyTilesAmount > 0 && summary.selfTilesAmount < summary.enemyTilesAmount) {
				tile.hasAction = true;
				tile.recycler = true;
				tile.blocked = true;
				action.push(`BUILD ${tile.y} ${tile.x}`);
				myMatter -= 10;
				if (myMatter < 10) {
					break;
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
		// Don't move if a tile can be defended
		/*const underThreat = unitTile
			.neighbors()
			.reduce(
				(acc, neighbor) => (neighbor.owner === Owner.Foe && neighbor.units > 0 ? acc + neighbor.units : acc),
				0
			);
		if (underThreat > 0 && unitTile.units >= underThreat) {
			unitTile.hasAction = true;
			continue;
		}*/
		// * Move
		const neighborsReach = tileNeighborsMoveReach(map, unitTile, unownedTileCondition, 2).sort(
			(a, b) => b[1] - a[1]
		);
		if (neighborsReach.length > 0) {
			const destination = neighborsReach[0][0];
			destination.hasAction = true;
			let amount = Math.ceil(unitTile.units * 0.8);
			if (destination.owner === Owner.Foe) {
				amount = Math.min(unitTile.units, destination.units + 1);
			}
			destination.movingUnits += amount;
			action.push(`MOVE ${amount} ${unitTile.y} ${unitTile.x} ${destination.y} ${destination.x}`);
		}
	}
	// ? Find the most profitable cells to spawn new robots on
	if (myMatter >= 20) {
		const mostProfitable = mostProfitableSpawnTiles(map, ownedTiles);
		for (const tile of mostProfitable) {
			const summary = adjacentTilesSummary(map, tile[0]);
			const toSpawn = Math.ceil(Math.max(10, Math.min(summary.enemyTilesAmount * 10, myMatter)) / 10);
			action.push(`SPAWN ${toSpawn} ${tile[0].y} ${tile[0].x}`);
			myMatter -= toSpawn * 10;
			if (myMatter < 10) {
				break;
			}
		}
	}

	// * Done
	if (action.length > 0) {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;${action.join(";")}`);
	} else {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;WAIT`);
	}

	round += 1;
}
