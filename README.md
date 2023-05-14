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


## Author

flex
