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
	closed: boolean;
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

/*function reconstruct(cameFrom: TileSet, current: Tile) {
	const path = [current];
	while (cameFrom[key(current)]) {
		current = cameFrom[key(current)];
		path.push(current);
	}
	return path;
}*/

let directions = [
	[-1, 0],
	[0, -1],
	[1, 0],
	[0, 1],
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
			// return reconstruct(cameFrom, node);
			return node;
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
				score += 1;
				fScore[neighborKey] = score;
				// Sorted insert
				let inserted = false;
				for (let i = 0; i < openSet.length; i++) {
					if (score < fScore[key(openSet[i])]) {
						openSet.splice(i, 0, neighbor);
						inserted = true;
						break;
					}
				}
				if (!inserted) {
					openSet.push(neighbor);
				}
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

function reachGoalCondition(goal: Tile) {
	return (node: Tile) => {
		return node.x === goal.x && node.y === goal.y;
	};
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
		unownedTiles: 0,
	};
	const upperXLimit = Math.min(tile.x + range, xLimit - 1);
	const upperYLimit = Math.min(tile.y + range, yLimit - 1);
	for (let i = Math.max(tile.x - range, 0); i <= upperXLimit; i++) {
		for (let j = Math.max(tile.y - range, 0); j <= upperYLimit; j++) {
			const closeTile = map[i][j];
			if (closeTile.blocked) {
				continue;
			}
			if (closeTile.owner === Owner.Self) {
				summary.selfRobotsAmount += closeTile.units;
				summary.selfTilesAmount += 1;
			} else if (closeTile.owner === Owner.Foe) {
				summary.enemyRobotsAmount += closeTile.units;
				summary.enemyTilesAmount += 1;
				summary.unownedTiles += 1;
			} else {
				summary.unownedTiles += 1;
			}
		}
	}
	return summary;
}

function mostProfitableRecyclerTile(map: TileMap, ownedTiles: Position[]): [Tile, number] | null {
	let mostProfitableTile: [Tile, number] | null = null;
	for (const ownedTile of ownedTiles) {
		const tile = map[ownedTile[0]][ownedTile[1]];
		if (!tile.canBuild || tile.units > 0 || tile.hasAction || tile.closed) {
			continue;
		}
		const neighbors = tile.neighbors().filter((n) => !n.blocked);
		let tileProfit = tile.scrapAmount + neighbors.length;
		for (const neighbor of neighbors) {
			if (!neighbor.inRangeOfRecycler) {
				tileProfit += neighbor.scrapAmount;
			}
		}
		if (tileProfit > 0 && (!mostProfitableTile || mostProfitableTile[1] < tileProfit)) {
			mostProfitableTile = [tile, tileProfit];
		}
	}
	return mostProfitableTile;
}

function spaceSize(around: Tile) {
	let tiles: TileSet = {};
	let explore: Tile[] = [around];
	while (explore.length > 0) {
		const tile = explore.splice(0, 1)[0];
		for (const neighbor of tile.neighbors()) {
			if (!neighbor.blocked) {
				const neighborKey = key(neighbor);
				if (!tiles[neighborKey]) {
					tiles[neighborKey] = neighbor;
					explore.push(neighbor);
				}
			}
		}
	}
	return Object.values(tiles).length;
}

function tileClosingSpaces(map: TileMap, tile: Tile): [Tile, Tile] | false {
	tile.blocked = true;
	// * First side
	let aNeighbor: Position = [tile.x + directions[0][0], tile.y + directions[0][1]];
	let bNeighbor: Position = [tile.x + directions[2][0], tile.y + directions[2][1]];
	let cNeighbor: Position = [tile.x + directions[1][0], tile.y + directions[1][1]];
	let dNeighbor: Position = [tile.x + directions[3][0], tile.y + directions[3][1]];
	if (
		(!exists(aNeighbor) || map[aNeighbor[0]][aNeighbor[1]].blocked) &&
		(!exists(bNeighbor) || map[bNeighbor[0]][bNeighbor[1]].blocked) &&
		exists(cNeighbor) &&
		!map[cNeighbor[0]][cNeighbor[1]].blocked &&
		exists(dNeighbor) &&
		!map[dNeighbor[0]][dNeighbor[1]].blocked
	) {
		const cTile = map[cNeighbor[0]][cNeighbor[1]];
		cTile.blocked = true;
		const dTile = map[dNeighbor[0]][dNeighbor[1]];
		dTile.blocked = true;
		const reachable =
			!aStar(map, cTile, reachGoalCondition(dTile)) && (spaceSize(cTile) > 3 || spaceSize(dTile) > 3);
		cTile.blocked = false;
		dTile.blocked = false;
		if (reachable) {
			tile.blocked = false;
			return [cTile, dTile];
		}
	}
	// * Second side
	if (
		(!exists(cNeighbor) || map[cNeighbor[0]][cNeighbor[1]].blocked) &&
		(!exists(dNeighbor) || map[dNeighbor[0]][dNeighbor[1]].blocked) &&
		exists(aNeighbor) &&
		!map[aNeighbor[0]][aNeighbor[1]].blocked &&
		exists(bNeighbor) &&
		!map[bNeighbor[0]][bNeighbor[1]].blocked
	) {
		const aTile = map[aNeighbor[0]][aNeighbor[1]];
		aTile.blocked = true;
		const bTile = map[bNeighbor[0]][bNeighbor[1]];
		bTile.blocked = true;
		const reachable =
			!aStar(map, aTile, reachGoalCondition(bTile)) && (spaceSize(aTile) > 3 || spaceSize(bTile) > 3);
		aTile.blocked = false;
		bTile.blocked = false;
		if (reachable) {
			tile.blocked = false;
			return [map[aNeighbor[0]][aNeighbor[1]], map[bNeighbor[0]][bNeighbor[1]]];
		}
	}
	tile.blocked = false;
	return false;
}

function setSpaceAsClosed(tiles: [Tile, Tile], closedTiles: TileCloseMap) {
	for (const side of tiles) {
		let tiles: TileSet = {};
		let explore: Tile[] = [side];
		let isOwned = true;
		while (explore.length > 0) {
			const tile = explore.splice(0, 1)[0];
			for (const neighbor of tile.neighbors()) {
				if (neighbor.owner === Owner.Foe) {
					isOwned = false;
					break;
				}
				if (!neighbor.blocked) {
					const neighborKey = key(neighbor);
					if (!tiles[neighborKey]) {
						tiles[neighborKey] = neighbor;
						explore.push(neighbor);
					}
				}
			}
			if (!isOwned) {
				break;
			}
		}
		if (isOwned) {
			for (const tile of Object.values<Tile>(tiles)) {
				closedTiles[tile.x][tile.y] = true;
				tile.closed = true;
			}
		}
	}
}

function mostProfitableSpawnTiles(map: TileMap, ownedTiles: Position[]): Tile[] {
	let tiles: [Tile, number][] = [];
	for (const position of ownedTiles) {
		const tile = map[position[0]][position[1]];
		const summary = closeTileSummary(map, tile, 1);
		const score = summary.unownedTiles * 10 - summary.selfRobotsAmount - tile.units * 5;
		if (score < 25) {
			continue;
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
const closedTiles: TileCloseMap = {};
for (let i = 0; i < height; i++) {
	closedTiles[i] = {};
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
				closed: closedTiles[i][j] === true,
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
	// ! Remember to reverse x and y (why did they do that ?) when emitting actions
	const action: string[] = [];
	// ? Defend robots under attack
	if (myMatter > 10) {
		for (const selfUnit of selfRobotTiles) {
			const unitTile = map[selfUnit[0]][selfUnit[1]];
			if (unitTile.hasAction) {
				continue;
			}
			for (const neighbor of unitTile.neighbors()) {
				if (neighbor.owner === Owner.Foe && neighbor.units > unitTile.units) {
					const amount = Math.min(neighbor.units - unitTile.units, Math.floor(myMatter / 10));
					action.push(`SPAWN ${amount} ${unitTile.y} ${unitTile.x}`);
					unitTile.hasAction = true;
					myMatter -= amount * 10;
					break;
				}
			}
			if (myMatter < 10) {
				break;
			}
		}
	}
	// ? Defend tiles under threat or with a lot of free estate
	for (const selfTilePosition of ownedTiles) {
		const tile = map[selfTilePosition[0]][selfTilePosition[1]];
		if (tile.hasAction || tile.closed) {
			continue;
		}
		if (tile.canBuild) {
			const spaceOpeningTiles = tileClosingSpaces(map, tile);
			if (spaceOpeningTiles) {
				action.push(`BUILD ${tile.y} ${tile.x}`);
				// Mark all tiles inside this space as closed
				tile.blocked = true;
				tile.hasAction = true;
				setSpaceAsClosed(spaceOpeningTiles, closedTiles);
				continue;
			}
		}
		if (tile.canSpawn) {
			let underThreat = 0;
			for (const neighbor of tile.neighbors()) {
				if (neighbor.owner === Owner.Foe && neighbor.units > tile.units) {
					underThreat = neighbor.units - tile.units;
					break;
				}
			}
			if (underThreat > 0 && myMatter > underThreat * 10) {
				action.push(`SPAWN ${underThreat} ${tile.y} ${tile.x}`);
				myMatter -= underThreat * 10;
				tile.hasAction = true;
			}
		}
	}
	// ? Farm resources
	if (round > 10 && round < 15) {
		const tile = mostProfitableRecyclerTile(map, ownedTiles);
		if (tile && tile[1] > 40) {
			action.push(`BUILD ${tile[0].y} ${tile[0].x}`);
			tile[0].blocked = true;
			tile[0].hasAction = true;
		}
	}
	// ? Move robots to control, defend or attack
	for (const selfUnit of selfRobotTiles) {
		const unitTile = map[selfUnit[0]][selfUnit[1]];
		if (unitTile.hasAction) {
			continue;
		}
		// * Attack if possible
		// TODO
		// * Move if nothing to do
		const closestUnownedTile = aStar(map, unitTile, unownedTileCondition);
		if (closestUnownedTile) {
			const destination = closestUnownedTile;
			destination.movingUnits += 1;
			action.push(`MOVE 1 ${unitTile.y} ${unitTile.x} ${destination.y} ${destination.x}`);
		}
	}
	// ? Find the most profitable cells to spawn new robots on
	if (myMatter > 10) {
		const mostProfitable = mostProfitableSpawnTiles(map, ownedTiles);
		for (const tile of mostProfitable) {
			action.push(`SPAWN 1 ${tile.y} ${tile.x}`);
			myMatter -= 10;
			if (myMatter < 10) {
				break;
			}
		}
	}

	if (action.length > 0) {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;${action.join(";")}`);
	} else if (round > 15 && myMatter > 10) {
		const amount = Math.floor(myMatter / 10);
		console.log(`MESSAGE ${Date.now() - roundStart}ms;SPAWN ${amount} ${ownedTiles[0][1]} ${ownedTiles[0][0]}`);
	} else {
		console.log(`MESSAGE ${Date.now() - roundStart}ms;WAIT`);
	}

	round += 1;
}
