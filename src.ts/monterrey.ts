import { pbkdf2 } from "pbkdf2";
import { EventEmitter } from "events";
import { chunk } from "lodash";
import { getLogger } from "./logger";
import path from "path";
import { mkdirp } from "mkdirp";
import fs from "fs-extra";
import { emasm } from "emasm";
import { add } from "winston";
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

export const checkBalances = async function(
  addresses,
  tokens,
  provider,
  blockTag = "latest",
) {
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
          return [
            toOffset(0x20),
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
        return r.concat(segment.concat(tokenSegments));
      }, [])
      .concat([
        toOffset(0x20 * addresses.length * (tokens.length + 1)),
        toOffset(0x24),
        "return",
      ]),
  ];
  const data = emasm(pausm);
  const ret = await provider.call({ data, blockTag });
  console.log((ret.length - 2) / 64, addresses.length, tokens.length);
  return (
    (ret).substr(2).match(/(?:\w{64})/g) ||
    []
  ).map((v) => ethers.toBigInt("0x" + v));
};

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

export const checkTokenBalances = async function(
  addresses,
  provider,
  blockTag = "latest",
  tokenAddress,
) {
  const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
  return Promise.all(
    addresses.map(async (address) => {
      tokenContract.balanceOf(address, {
        blockTag: blockTag,
      });
    }),
  );
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

export type Token = { decimals: number; conversionRate: number; symbol?: string };

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
  public tokenConversionRate: { [key: string]: Token };
  public ethConversion: any;

  static async create(o: any) {
    await ready;
    const instance = new this(o);
    await instance._backend.initialize();
    return instance;
  }

  constructor({
    salt,
    backend,
    logger,
    provider,
    tokenConversionRate,
    ethConversion,
  }) {
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
    this.tokenConversionRate = tokenConversionRate || {};
    this.ethConversion = ethConversion || 1n;
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
    this.logger.info(key + "|+" + ethers.formatEther(BigInt(amount)) + " CREDIT");
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
      const tokens = Object.keys(this.tokenConversionRate);
      const chunkBalances = (ary) => {
        const balances = chunk(ary, (tokens.length + 1));
        console.log("fda", balances);
        return Array(tokens.length + 1)
          .fill(0)
          .map((v, i) =>
            i === 0
              ? {
                token: "ETH",
                balance: balances.map((a) => a[0]),
                index: 0,
              }
              : {
                token: tokens[i - 1],
                balance: balances.map((a) => a[i]),
                index: i,
              },
          );
      };

      const oldBalances = chunkBalances(
        await checkBalances(
          wallets,
          tokens,
          this.provider,
          ethers.toBeHex(blockNumber),
        ),
      );

      const newBalances = chunkBalances(
        await checkBalances(
          wallets,
          tokens,
          this.provider,
          ethers.toBeHex(newBlockNumber),
        ),
      );
      const flush = this._backend.flush;
      this._backend.flush = async () => { }; // make sure we flush all values synchronously
      let allDiffs = newBalances.flatMap((v, i) => {
        return v.balance.map((innerV, j) => {
          console.log(v)
          return [
            v.token,
            innerV - oldBalances[i].balance[j],
            j,
          ]
        });
      })
      console.log("diffs", allDiffs)
      for (const [token, diff, i] of allDiffs) {
        // @ts-ignore
        if (diff > 0) {
          const key = this._lookup[wallets[i]];
          if (token === "ETH") {
            const credit = ethers.toBigInt(diff) * this.ethConversion;
            this.logger.info(key + "|+" + ethers.formatEther(diff) + " ETH");
            await this.credit(
              this._lookup[wallets[i]],
              credit
            );
          } else {
            const tokenObject = this.tokenConversionRate[token];
            const multiple = diff * ethers.toBigInt(tokenObject.conversionRate)
            const credit = multiple / 10n ** ethers.toBigInt(tokenObject.decimals);

            this.logger.info(key + "|+" + ethers.formatUnits(diff, tokenObject.decimals) + " " + tokenObject.symbol);
            await this.credit(
              this._lookup[wallets[i]],
              credit * 10n ** (18n - ethers.toBigInt(tokenObject.decimals))
            );
          }
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
      if (!halt) this.provider.on("block", listener);
      else return;
      die = () => {
        this.provider.removeListener("block", listener);
      };
    })().catch((err) => this.logger.error(err));

    return unsubscribe;
  }
}
