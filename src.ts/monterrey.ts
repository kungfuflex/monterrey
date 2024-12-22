import { pbkdf2 } from "pbkdf2";
import { EventEmitter } from "events";
import { getLogger } from "./logger";
import path from "path";
import { mkdirp } from "mkdirp";
import fs from "fs-extra";
import { emasm } from "emasm";
import { zipObject } from "lodash";
import {
  leftPadBytes32,
  rightPadBytes32,
  leftPadByte,
  stripHexPrefix,
  addHexPrefix,
} from "./utils";
const ethersPromise = import("ethers");
export type Ethers = Awaited<typeof ethersPromise>;
let ethers: Ethers = {} as Ethers;

const logger = getLogger();

const ready = new Promise<void>((resolve, reject) => {
  (async () => {
    ethers = await ethersPromise;
    resolve();
  })().catch((err) => {
    logger.error(err);
    reject(err);
  });
});

const toOffset = (v): string => {
  if (!v) return "returndatasize";
  return ethers.toBeHex(ethers.toBigInt(v));
};

const ZERO_ADDRESS = addHexPrefix("0".repeat(40));

export const checkTokenBalances = async function (
  token,
  addresses,
  provider,
  blockTag = "latest",
) {
  const balanceOfSelector = rightPadBytes32(
    new ethers.Interface(["function balanceOf(address) view returns (uint256)"])
      .encodeFunctionData("balanceOf", [ZERO_ADDRESS])
      .substr(0, 10),
  );
  const data = emasm(
    addresses.reduce(
      (r, v, i) =>
        r.concat([
          leftPadBytes32(v),
          "0x4",
          "mstore",
          "0x20",
          leftPadByte(addHexPrefix(Number(i * 0x20 + 0x24).toString(16))),
          "0x24",
          "0x0",
          "0x0",
          leftPadBytes32(token.toLowerCase()),
          "gas",
          "call",
          "pop",
        ]),
      [balanceOfSelector, "0x0", "mstore"],
    ).concat([leftPadByte(Number(addresses.length * 0x20).toString(16)), '0x24', 'return'])
  );
  const balances = (
    (await provider.call({ data, blockTag })).substr(2).match(/(?:\w{64})/g) ||
    []
  ).map((v) => ethers.toBigInt("0x" + v));
  return zipObject(addresses.map((v) => ethers.getAddress(v)), balances);
};

export const checkBalances = async function (
  addresses,
  provider,
  blockTag = "latest",
) {
  const data = emasm(
    addresses
      .reduce((r, v, i) => {
        return r.concat([v, "balance", toOffset(i * 0x20), "mstore"]);
      }, [])
      .concat([toOffset(0x20 * addresses.length), toOffset(0x0), "return"]),
  );
  return (
    (await provider.call({ data, blockTag })).substr(2).match(/(?:\w{64})/g) ||
    []
  ).map((v) => ethers.toBigInt("0x" + v));
};

export class FileBackend implements IBackend {
  public pathname: string;
  public db: {
    [key: string]: any;
  };
  constructor(pathname) {
    this.pathname = path.join(pathname, "db.json");
    this.db = {};
  }
  async initializeDirectory() {
    await mkdirp(path.parse(this.pathname).dir);
  }
  async initialize() {
    this.db = JSON.parse(await fs.readFile(this.pathname, "utf8"));
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
    await fs.writeFile(this.pathname, JSON.stringify(this.db, null, 2));
  }
}

interface IBackend {
  set(key: string, value: any): Promise<void>;
  get(key: string): Promise<any>;
  keys(): Promise<string[]>;
  initialize(): Promise<void>;
  flush(): Promise<void>;
}

export const keygen = async (password, salt): Promise<string> => {
  return await new Promise((resolve, reject) =>
    pbkdf2(
      Buffer.from(password),
      ethers.toBeArray(salt),
      1,
      32,
      (err, result) =>
        err ? reject(err) : resolve("0x" + Buffer.from(result).toString("hex")),
    ),
  );
};

export const toBalanceKey = (key) => key + "@@balance";
export const toCountKey = (key) => key + "@@count";

export class Monterrey extends EventEmitter {
  public _cache: { [key: string]: any };
  public _lookup: { [key: string]: string };
  public _salt: string;
  public _backend: IBackend;
  public logger: ReturnType<typeof getLogger>;
  public provider: any;
  public ethers: any;
  static async create(o: any) {
    await ready;
    const instance = new this(o);
    await instance._backend.initialize();
    return instance;
  }
  constructor({ salt, backend, logger, provider }) {
    super();
    if (typeof backend === "string" || !backend)
      this._backend = new FileBackend(
        backend || path.join(process.env.HOME, ".monterrey"),
      );
    else this._backend = backend;
    this._salt = salt;
    this._lookup = {};
    this._cache = {};
    this.logger = logger || getLogger();
    this.provider =
      provider ||
      new ethers.InfuraProvider("mainnet", process.env.INFURA_PROJECT_ID);
  }
  async count(key) {
    return (await this._backend.get(toCountKey(key))) || 0;
  }
  _setCache(key, index, value) {
    if (!this._cache[key]) this._cache[key] = {};
    this._cache[key][index] = value;
    this._lookup[new ethers.Wallet(value).address] = key;
  }
  _getCache(key, index) {
    if (this._cache[key]) return this._cache[key][Number(index)] || null;
    return null;
  }
  async generate(key, index?) {
    const n = index == null ? await this.count(key) : index;
    const cached = this._getCache(key, n);
    if (cached) return new ethers.Wallet(cached);
    this.logger.info(key + "|" + String(n));
    const privateKey = await keygen(
      key,
      ethers.solidityPackedKeccak256(["string", "uint256"], [this._salt, n]),
    );
    this._setCache(key, n, privateKey);
    await this._backend.set(toCountKey(key), (n || 0) + 1);
    return new ethers.Wallet(privateKey);
  }
  async credit(key, amount) {
    const balanceKey = toBalanceKey(key);
    const balance = ethers.toBigInt(
      (await this._backend.get(balanceKey)) || "0x00",
    );
    await this._backend.set(
      balanceKey,
      ethers.toBeHex(balance + BigInt(amount)),
    );
    this.logger.info(key + "|+" + ethers.formatEther(BigInt(amount)));
    this.emit("credit", { account: key, amount });
    return true;
  }
  async debit(key, amount) {
    const balanceKey = toBalanceKey(key);
    const balance = ethers.toBigInt(
      (await this._backend.get(balanceKey)) || "0x00",
    );
    const newBalance = balance - BigInt(amount);
    if (newBalance < 0n) return false;
    await this._backend.set(balanceKey, ethers.toBeHex(newBalance));
    this.logger.info(key + "|-" + ethers.formatEther(BigInt(amount)));
    this.emit("debit", { account: key, amount });
    return true;
  }
  async getBalance(key) {
    return (await this._backend.get(toBalanceKey(key))) || 0n;
  }
  async getWallets() {
    const keys = await this._backend.keys();
    const ids = keys
      .filter((v) => v.match(toCountKey("")))
      .map((v) => v.replace(toCountKey(""), ""));
    let wallets = [];
    for (const id of ids) {
      const count = await this._backend.get(toCountKey(id));
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
      const newBalances = await checkBalances(
        wallets,
        this.provider,
        ethers.toBeHex(newBlockNumber),
      );
      const oldBalances = await checkBalances(
        wallets,
        this.provider,
        ethers.toBeHex(blockNumber),
      );
      const flush = this._backend.flush;
      this._backend.flush = async () => {}; // make sure we flush all values synchronously
      for (const [diff, i] of newBalances.map((v, i) => [
        v - oldBalances[i],
        i,
      ])) {
        if (diff > 0) {
          await this.credit(this._lookup[wallets[i]], diff);
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
      while ((await this.tick()) && !halt) {}
      const listener = (block) => {
        (async () => {
          await this.tick();
        })().catch((err) => this.logger.error(err));
      };
      if (!halt) this.provider.on("block", listener);
      else return;
      die = () => {
        this.provider.removeListener("block", listener);
      };
    })().catch((err) => this.logger.error(err));
    return unsubscribe;
  }
}
