/// <reference types="node" />
import { EventEmitter } from "events";
import { getLogger } from "./logger";
export declare const checkBalances: (addresses: any, provider: any, blockTag?: string) => Promise<any>;
export declare class FileBackend implements IBackend {
    pathname: string;
    db: {
        [key: string]: any;
    };
    constructor(pathname: any);
    initializeDirectory(): Promise<void>;
    initialize(): Promise<void>;
    set(key: any, value: any): Promise<void>;
    get(key: any): Promise<any>;
    keys(): Promise<string[]>;
    flush(): Promise<void>;
}
interface IBackend {
    set(key: string, value: any): Promise<void>;
    get(key: string): Promise<any>;
    keys(): Promise<string[]>;
    initialize(): Promise<void>;
    flush(): Promise<void>;
}
export declare const keygen: (password: any, salt: any) => Promise<string>;
export declare const toBalanceKey: (key: any) => string;
export declare const toCountKey: (key: any) => string;
export declare class Monterrey extends EventEmitter {
    _cache: {
        [key: string]: any;
    };
    _lookup: {
        [key: string]: string;
    };
    _salt: string;
    _backend: IBackend;
    logger: ReturnType<typeof getLogger>;
    provider: any;
    ethers: any;
    static create(o: any): Promise<Monterrey>;
    constructor({ salt, backend, logger, provider }: {
        salt: any;
        backend: any;
        logger: any;
        provider: any;
    });
    count(key: any): Promise<any>;
    _setCache(key: any, index: any, value: any): void;
    _getCache(key: any, index: any): any;
    generate(key: any, index?: any): Promise<any>;
    credit(key: any, amount: any): Promise<boolean>;
    debit(key: any, amount: any): Promise<boolean>;
    getBalance(key: any): Promise<any>;
    getWallets(): Promise<any[]>;
    tick(): Promise<boolean>;
    start(): () => void;
}
export {};
