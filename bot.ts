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

type CloseTileSummary = {
	enemyRobotsAmount: number;
	selfRobotsAmount: number;
	enemyTilesAmount: number;
	selfTilesAmount: number;
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

function reconstruct(cameFrom: TileSet, current: Tile) {
	const path = [current];
	while (cameFrom[key(current)]) {
		current = cameFrom[key(current)];
		path.push(current);
	}
	return path;
}

const directions = [
	[0, -1],
	[0, 1],
	[1, 0],
	[-1, 0],
];

function aStar(map: TileMap, start: Tile, goal: (tile: Tile) => boolean) {
	const startKey = key(start);
	let openSet = [start];
	let cameFrom: TileSet = {};
	let gScore: TileScoreSet = { [startKey]: 0 };
	let fScore: TileScoreSet = { [startKey]: 1 };

	while (openSet.length > 0) {
		let node = openSet.splice(0, 1)[0];
		const useKey = key(node);
		if (goal(node)) {
			return reconstruct(cameFrom, node);
		}

		const neighbors = directions
			.map((d): Position => [node.x + d[0], node.y + d[1]])
			.filter((p) => exists(p) && !map[p[0]][p[1]].blocked)
			.map((p) => map[p[0]][p[1]]);
		for (const neighbor of neighbors) {
			let neighborKey = key(neighbor);
			let score = gScore[useKey] + 1;
			if (gScore[neighborKey] === undefined || score < gScore[neighborKey]) {
				cameFrom[neighborKey] = node;
				gScore[neighborKey] = score;
				fScore[neighborKey] = score + 1;
				// TODO min-heap
				// if (openSet[neighborKey] === undefined) {
				openSet.push(neighbor);
				openSet.sort((a, b) =>
					fScore[key(a)] === undefined
						? -1
						: fScore[key(b)] === undefined
						? 1
						: fScore[key(a)] - fScore[key(b)]
				);
				// }
			}
		}
	}

	return false;
}

function closestEnemyCondition(node: Tile) {
	return node.owner === Owner.Foe;
}

function closestAllyCondition(node: Tile) {
	return node.owner === Owner.Self;
}

function unownedTileCondition(node: Tile) {
	return node.owner !== Owner.Self && node.movingUnits < 1;
}

// * Map utility

function tileScrapValue(map: TileMap, tile: Tile) {
	let value = tile.scrapAmount;
	for (const direction of directions) {
		const position: Position = [tile.x + direction[0], tile.y + direction[1]];
		if (exists(position)) {
			value += map[position[0]][position[1]].scrapAmount;
		}
	}
	return value;
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

function closeTileSummary(map: TileMap, tile: Tile, range: number): CloseTileSummary {
	const summary: CloseTileSummary = {
		selfRobotsAmount: 0,
		enemyRobotsAmount: 0,
		selfTilesAmount: 0,
		enemyTilesAmount: 0,
	};
	const upperXLimit = Math.min(tile.x + range, xLimit);
	const upperYLimit = Math.min(tile.y + range, yLimit);
	for (let i = Math.max(tile.x - range, 0); i < upperXLimit; i++) {
		for (let j = Math.max(tile.y - range, 0); j < upperYLimit; j++) {
			const closeTile = map[i][j];
			if (closeTile.owner === Owner.Self) {
				summary.selfRobotsAmount += closeTile.units;
				summary.selfTilesAmount += 1;
			} else if (closeTile.owner === Owner.Foe) {
				summary.enemyRobotsAmount += closeTile.units;
				summary.enemyTilesAmount += 1;
			}
		}
	}
	return summary;
}

function mostProfitableTile(map: TileMap, ownedTiles: Position[]): Tile | null {
	let mostProfitableTile: [Tile, number] | null = null;
	for (const ownedTile of ownedTiles) {
		const tile = map[ownedTile[0]][ownedTile[1]];
		if (tile.canBuild || tile.units > 0) {
			continue;
		}
		let tileProfit = tile.scrapAmount;
		for (const neighbor of tile.neighbors()) {
			if (!neighbor.inRangeOfRecycler) {
				tileProfit += neighbor.scrapAmount;
			}
		}
		if (tileProfit > 0 && (!mostProfitableTile || mostProfitableTile[1] < tileProfit)) {
			mostProfitableTile = [tile, tileProfit];
		}
	}
	return mostProfitableTile ? mostProfitableTile[0] : null;
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
			if (units > 0) {
				if (owner === Owner.Self) {
					for (let a = 0; a < units; a++) {
						selfRobotTiles.push([i, j]);
					}
				} else {
					for (let a = 0; a < units; a++) {
						foeRobotTiles.push([i, j]);
					}
				}
			}
		}
		map.push(row);
	}
	// Find which side we're on on the first round
	if (round === 1) {
		if (map[ownedTiles[0][0]][ownedTiles[0][1]].x < width / 2) {
			side = Side.Left;
		} else {
			side = Side.Right;
		}
	}

	// * Process
	// ! Remember to reverse x and y (why did they do that ?) when emitting actions
	const action: string[] = [];
	// ? Farm resources
	if (round % 5 === 0) {
		const tile = mostProfitableTile(map, ownedTiles);
		if (tile) {
			action.push(`BUILD ${tile.y} ${tile.x}`);
			tile.hasAction = true;
		}
	}
	// ? Defend tiles under threat
	for (const selfTilePosition of ownedTiles) {
		const tile = map[selfTilePosition[0]][selfTilePosition[1]];
		if (tile.hasAction) {
			continue;
		}
		let underThreat = 0;
		for (const neighbor of tile.neighbors()) {
			if (neighbor.owner === Owner.Foe && neighbor.units > tile.units) {
				underThreat = neighbor.units - tile.units;
				break;
			}
		}
		if (underThreat > 0) {
			if (myMatter >= underThreat * 10) {
				action.push(`SPAWN ${underThreat} ${tile.y} ${tile.x}`);
				tile.hasAction = true;
			}
		}
	}
	// ? Move robots to control, defend or attack
	for (const selfUnit of selfRobotTiles) {
		const unitTile = map[selfUnit[0]][selfUnit[1]];
		if (unitTile.hasAction) {
			continue;
		}
		// * Attack if possible
		// * Control if nothing to do
		const closestUnownedTile = aStar(map, unitTile, unownedTileCondition);
		if (closestUnownedTile) {
			const destination = closestUnownedTile[0];
			destination.movingUnits += 1;
			action.push(`MOVE 1 ${unitTile.y} ${unitTile.x} ${destination.y} ${destination.x}`);
		} else {
			// TODO Default action if no unowned tiles ?
		}
	}
	if (action.length > 0) {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;`, action.join(";"));
	} else {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;`, "WAIT");
	}

	round += 1;
}
