# monterrey

In-process payment processor and balance sheet management, intended to be embedded as a library in a user-facing service.

Users of any monterrey enabled service pay to EOA wallets on the target EVM network (defaults to Ethereum mainnet). When monterrey is started, the target network is queried for a complete balance sheet for any payment address known to the database.

Any private key in the system can be computed via pbkdf2, using the desired account identifier and the  secret salt phrase supplied by the implementer.

## Usage

```sh
yarn add https://github.com/kungfuflex/monterrey
```

```js

import { Monterrey } from "monterrey";
import path from "path";
import crypto from "crypto";
import type { Wallet } from "ethers";

const salt = crypto.randomBytes(32).toString('base64');

(async () => {
  const monterrey = await Monterrey.create({
    backend: path.join(process.env.HOME, '.my-application'),
    salt
  }); 
  monterrey.start(); // return value is an unsubscribe function to stop monterrey
  const account = 'flex';
  const wallet: Wallet = await monterrey.generate(account);
  console.log('deposit to: ' + wallet.address);
  const nextWallet: Wallet = await monterrey.generate(account);
  console.log('deposit more to: ' + nextWallet.address);
  monterrey.on('credit', ({ account, amount }) => {
    console.log('user ' + account + ' balance increases by ' + ethers.formatEther(amount));
  });
  monterrey.on('debit', ({ account, amount }) => {
    console.log('user ' + account + ' balance decreases by ' + ethers.formatEther(amount));
  });
  // debit only occurs when the method is explicitly invoked
  const success = await monterrey.debit(account, ethers.parseEther('0.1');
  if (!success) console.error('insufficient balance');
})().catch((err) => console.error(err));
```

### Fetching Token Balances

```js
import { checkTokenBalances } from "monterrey";
import { ethers } from "ethers";
(async () => {
  const provider = new ethers.InfuraProvider('mainnet');
  const usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  const address = "0x494BBCDa6127c80082846F1cB7B6351442f91182";
  const address2 = "0x055D9A4dc18687872D95E2324335AAa4fbd29F05";
  const balanceSheet = await checkTokenBalances(usdt, [ address, address2 ], provider, "latest");
  /*
    Balance sheet is a structure like:
    {
      [address]: 100n,
      [address2]: 101n
    }
  */
  console.log(Object.entries(balanceSheet))
})().catch((err) => console.error(err));


## Author

flex
