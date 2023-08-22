"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Monterrey = exports.toCountKey = exports.toBalanceKey = exports.keygen = exports.FileBackend = exports.checkTokenBalances = exports.checkBalances = void 0;
const pbkdf2_1 = require("pbkdf2");
const events_1 = require("events");
const lodash_1 = require("lodash");
const logger_1 = require("./logger");
const path_1 = __importDefault(require("path"));
const mkdirp_1 = require("mkdirp");
const fs_extra_1 = __importDefault(require("fs-extra"));
const emasm_1 = require("emasm");
const ethersPromise = import("ethers");
let ethers = {};
const logger = (0, logger_1.getLogger)();
const ready = new Promise((resolve, reject) => {
    (async () => {
        ethers = await ethersPromise;
        resolve();
    })().catch((err) => {
        logger.error(err);
        reject(err);
    });
});
const toOffset = (v) => {
    if (!v)
        return "returndatasize";
    return ethers.toBeHex(ethers.toBigInt(v));
};
const checkBalances = async function (addresses, tokens, provider, blockTag = "latest") {
    console.log("asdf", addresses, tokens);
    const pausm = [
        "0x70a0823100000000000000000000000000000000000000000000000000000000",
        "0x0",
        "mstore",
        addresses
            .reduce((r, v, i) => {
            const segment = [
                v,
                "balance",
                toOffset(0x24 + i * 0x20 * (tokens.length + 1)),
                "mstore",
            ];
            const tokenSegments = tokens.map((token, tokenIndex) => {
                console.log("offset", toOffset(0x24 + (0x20 * (i * (tokens.length + 1) + tokenIndex + 1))));
                return [
                    toOffset(0x20),
                    // toOffset(0x24 + (i * 0x20 * (tokens.length + 1) + tokenIndex)),
                    toOffset(0x24 + (0x20 * (i * (tokens.length + 1) + tokenIndex + 1))),
                    "0x24",
                    "0x0",
                    token,
                    "gas",
                    v,
                    "0x4",
                    "mstore",
                    "staticcall",
                    "pop",
                ];
            });
            return r.concat(segment);
        }, [])
            .concat([
            toOffset(0x20 * addresses.length * (tokens.length + 1)),
            toOffset(0x24),
            "return",
        ]),
    ];
    console.log(pausm);
    const data = (0, emasm_1.emasm)(pausm);
    const ret = await provider.call({ data, blockTag });
    console.log("ret", ret.length, ret);
    return ((ret).substr(2).match(/(?:\w{64})/g) ||
        []).map((v) => ethers.toBigInt("0x" + v));
};
exports.checkBalances = checkBalances;
const tokenAbi = [
    {
        constant: true,
        inputs: [{ name: "_owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "uint256" }],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
];
const checkTokenBalances = async function (addresses, provider, blockTag = "latest", tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
    return Promise.all(addresses.map(async (address) => {
        tokenContract.balanceOf(address, {
            blockTag: blockTag,
        });
    }));
};
exports.checkTokenBalances = checkTokenBalances;
class FileBackend {
    constructor(pathname) {
        this.pathname = path_1.default.join(pathname, "db.json");
        this.db = {};
    }
    async initializeDirectory() {
        await (0, mkdirp_1.mkdirp)(path_1.default.parse(this.pathname).dir);
    }
    async initialize() {
        this.db = JSON.parse(await fs_extra_1.default.readFile(this.pathname, "utf8"));
    }
    async set(key, value) {
        this.db[key] = value;
        await this.flush();
    }
    async get(key) {
        return this.db[key];
    }
    async keys() {
        return Object.keys(this.db);
    }
    async flush() {
        await this.initializeDirectory();
        await fs_extra_1.default.writeFile(this.pathname, JSON.stringify(this.db, null, 2));
    }
}
exports.FileBackend = FileBackend;
const keygen = async (password, salt) => {
    return await new Promise((resolve, reject) => (0, pbkdf2_1.pbkdf2)(Buffer.from(password), ethers.toBeArray(salt), 1, 32, (err, result) => err ? reject(err) : resolve("0x" + Buffer.from(result).toString("hex"))));
};
exports.keygen = keygen;
const toBalanceKey = (key) => key + "@@balance";
exports.toBalanceKey = toBalanceKey;
const toCountKey = (key) => key + "@@count";
exports.toCountKey = toCountKey;
class Monterrey extends events_1.EventEmitter {
    static async create(o) {
        await ready;
        const instance = new this(o);
        await instance._backend.initialize();
        return instance;
    }
    constructor({ salt, backend, logger, provider, tokenConversionRate, ethConversion, }) {
        super();
        if (typeof backend === "string" || !backend)
            this._backend = new FileBackend(backend || path_1.default.join(process.env.HOME, ".monterrey"));
        else
            this._backend = backend;
        this._salt = salt;
        this._lookup = {};
        this._cache = {};
        this.logger = logger || (0, logger_1.getLogger)();
        this.tokenConversionRate = tokenConversionRate || {};
        this.ethConversion = ethConversion || 1n;
        this.provider =
            provider ||
                new ethers.InfuraProvider("mainnet", process.env.INFURA_PROJECT_ID);
    }
    async count(key) {
        return (await this._backend.get((0, exports.toCountKey)(key))) || 0;
    }
    _setCache(key, index, value) {
        if (!this._cache[key])
            this._cache[key] = {};
        this._cache[key][index] = value;
        this._lookup[new ethers.Wallet(value).address] = key;
    }
    _getCache(key, index) {
        if (this._cache[key])
            return this._cache[key][Number(index)] || null;
        return null;
    }
    async generate(key, index) {
        const n = index == null ? await this.count(key) : index;
        const cached = this._getCache(key, n);
        if (cached)
            return new ethers.Wallet(cached);
        this.logger.info(key + "|" + String(n));
        const privateKey = await (0, exports.keygen)(key, ethers.solidityPackedKeccak256(["string", "uint256"], [this._salt, n]));
        this._setCache(key, n, privateKey);
        await this._backend.set((0, exports.toCountKey)(key), (n || 0) + 1);
        return new ethers.Wallet(privateKey);
    }
    async credit(key, amount) {
        const balanceKey = (0, exports.toBalanceKey)(key);
        const balance = ethers.toBigInt((await this._backend.get(balanceKey)) || "0x00");
        await this._backend.set(balanceKey, ethers.toBeHex(balance + BigInt(amount)));
        this.logger.info(key + "|+" + ethers.formatEther(BigInt(amount)));
        this.emit("credit", { account: key, amount });
        return true;
    }
    async debit(key, amount) {
        const balanceKey = (0, exports.toBalanceKey)(key);
        const balance = ethers.toBigInt((await this._backend.get(balanceKey)) || "0x00");
        const newBalance = balance - BigInt(amount);
        if (newBalance < 0n)
            return false;
        await this._backend.set(balanceKey, ethers.toBeHex(newBalance));
        this.logger.info(key + "|-" + ethers.formatEther(BigInt(amount)));
        this.emit("debit", { account: key, amount });
        return true;
    }
    async getBalance(key) {
        return (await this._backend.get((0, exports.toBalanceKey)(key))) || 0n;
    }
    async getWallets() {
        const keys = await this._backend.keys();
        const ids = keys
            .filter((v) => v.match((0, exports.toCountKey)("")))
            .map((v) => v.replace((0, exports.toCountKey)(""), ""));
        let wallets = [];
        for (const id of ids) {
            const count = await this._backend.get((0, exports.toCountKey)(id));
            for (let i = 0; i < count; i++) {
                wallets.push(await this.generate(id, i));
            }
        }
        return wallets;
    }
    async tick() {
        const current = await this.provider.getBlockNumber();
        const blockNumber = (await this._backend.get("@@block")) || current;
        if (blockNumber < current) {
            const wallets = (await this.getWallets()).map((v) => v.address);
            const newBlockNumber = blockNumber + 1;
            const tokens = Object.keys(this.tokenConversionRate);
            const rates = tokens.map((v) => this.tokenConversionRate[v].conversionRate);
            const chunkBalances = (ary) => {
                const balances = (0, lodash_1.chunk)(ary, ary.length / (tokens.length + 1));
                console.log("bal", ary, ary.length);
                const ether = balances[0];
                const token = balances.slice(1);
                return Array(balances.length)
                    .fill(0)
                    .map((v, i) => i === 0
                    ? {
                        token: "ETH",
                        balance: balances[0],
                    }
                    : {
                        token: tokens[i - 1],
                        balance: balances[i],
                    });
            };
            console.log("\n\n\n--- before ---");
            const oldBalances = chunkBalances(await (0, exports.checkBalances)(wallets, tokens, this.provider, ethers.toBeHex(blockNumber)));
            console.log("--- after ---");
            const newBalances = chunkBalances(await (0, exports.checkBalances)(wallets, tokens, this.provider, ethers.toBeHex(newBlockNumber)));
            const flush = this._backend.flush;
            this._backend.flush = async () => { }; // make sure we flush all values synchronously
            let allDiffs = newBalances.flatMap((v, i) => {
                return v.balance.map((innerV, j) => {
                    return [
                        v.token,
                        innerV - oldBalances[i].balance[j],
                        j,
                    ];
                });
            });
            for (const [token, diff, i] of allDiffs) {
                // @ts-ignore
                if (diff > 0) {
                    console.log(token, diff);
                    await this.credit(this._lookup[wallets[i]], 
                    // @ts-ignore
                    diff *
                        (token === "ETH"
                            ? this.ethConversion
                            : this.tokenConversionRate[token].conversionRate));
                }
            }
            delete this._backend.flush;
            await this._backend.set("@@block", newBlockNumber);
            return true;
        }
        return false;
    }
    start() {
        let halt = false;
        let die = () => {
            halt = true;
        };
        let unsubscribe = () => {
            die();
        };
        (async () => {
            while ((await this.tick()) && !halt) { }
            const listener = (block) => {
                (async () => {
                    await this.tick();
                })().catch((err) => this.logger.error(err));
            };
            if (!halt)
                this.provider.on("block", listener);
            else
                return;
            die = () => {
                this.provider.removeListener("block", listener);
            };
        })().catch((err) => this.logger.error(err));
        return unsubscribe;
    }
}
exports.Monterrey = Monterrey;
//# sourceMappingURL=monterrey.js.map