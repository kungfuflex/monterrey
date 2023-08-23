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

Using erc20 tokens it is reccomended to use a conversion so that the "value" to debit
from is consistent. The conversion is done at credit time not deposit time.

```js
(async () => {
  const monterrey = await Monterrey.create({
    backend: path.join(process.env.HOME, '.my-application'),
    salt,
    ethConversion: 12000000000n,
    tokenConversionRate: {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':
      {
        conversionRate: 6666666667000n,
        decimals: 6n,
        symbol: 'USDC'
      },
      "0xdAC17F958D2ee523a2206206994597C13D831ec7": {
        conversionRate: 6666666667000n,
        decimals: 6n,
        symbol: 'USDT'
      },
      "0x6B175474E89094C44Da98b954EedeAC495271d0F": {
        conversionRate: 6666666667000n,
        decimals: 18n,
        symbol: 'DAI'
      },
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": {
        conversionRate: 16666666666700000000n,
        decimals: 8n,
        symbol: 'WBTC'
      },
    }
  }); 
  monterrey.start(); // return value is an unsubscribe function to stop monterrey
  const account = 'flex';
  const wallet: Wallet = await monterrey.generate(account);
  console.log('deposit to: ' + wallet.address);
  const nextWallet: Wallet = await monterrey.generate(account);
  console.log('deposit more to: ' + nextWallet.address);
  monterrey.on('credit', ({ account, amount }) => {
    console.log('user ' + account + ' balance increases by ' + ethers.formatEther(amount) + '"points"');
  });
  monterrey.on('debit', ({ account, amount }) => {
    console.log('user ' + account + ' balance decreases by ' + ethers.formatEther(amount) + '"points"');
  });
  // debit only occurs when the method is explicitly invoked
  const success = await monterrey.debit(account, '10');
  if (!success) console.error('insufficient balance');
})().catch((err) => console.error(err));

```


## Author

flex
