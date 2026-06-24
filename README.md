# Streaming Micropayments

A Soqucoin Builders League starter template. A viewer pays per second of content over a post-quantum Lightning channel, and stops paying the instant they stop watching. Clone it, swap in your stream, and you have pay-as-you-go billing with no subscription and no upfront commitment.

## Quickstart

```bash
npm install
npm start
```

Runs in LOCAL simulation by default, ticking once per second so you can watch the stream pay down in real time:

```
Streaming a 5s clip at 1000 sat/second. You pay only for what you watch.

   1s   paid 1000 sat   total 1000 sat   balance 9.99999000 SOQ
   2s   paid 1000 sat   total 2000 sat   balance 9.99998000 SOQ
   3s   paid 1000 sat   total 3000 sat   balance 9.99997000 SOQ
   4s   paid 1000 sat   total 4000 sat   balance 9.99996000 SOQ
   5s   paid 1000 sat   total 5000 sat   balance 9.99995000 SOQ

Stream completed. Watched 5s, paid 5000 sat total (0.00005000 SOQ).
```

To stream real payments on stagenet:

```bash
cp .env.example .env
# set LSP_URL=https://lightning.soqupool.com
npm start
```

## How it works

The whole thing is one class, `PaymentStream` (see `src/streamer.ts`):

```ts
import { PaymentStream } from "./streamer.js";

const stream = await PaymentStream.create({ lspUrl: process.env.LSP_URL, ratePerSecondSat: 1000 });

// Pay the rate every second for up to 5 seconds. onTick fires per paid tick.
await stream.run(5, (s) => console.log(`${s.second}s, paid ${s.totalPaidSat} sat so far`));

await stream.close();
```

`run()` pays `ratePerSecondSat` on a self-scheduling timer, so a slow live payment never overlaps the next tick. It stops on three conditions: the duration is reached, `stop()` is called, or the channel balance runs low (so a viewer can never overspend). Each tick is one `ln.pay()` on the channel.

Amounts are in satoshis; 1 SOQ is 100,000,000.

## Make it yours

- Set `ratePerSecondSat` to your price and `run(seconds, ...)` to your content length.
- Call `stream.stop()` when the user pauses, closes the tab, or the job finishes. They pay only for what they consumed.
- The same pattern meters anything continuous: video and audio, live data feeds, per-second compute or GPU time, bandwidth, or an AI session billed by the second.

## The honest boundary

In LOCAL mode the payments are simulated so you can run it with no network. In LIVE mode (set `LSP_URL`) each tick is a real `ln.pay()` over a stagenet channel between the viewer and the Lightning service provider. The code path is identical; only the destination differs. Full routing to an arbitrary content host uses the SDK's HTLC and forwarding layer, which lights up as those endpoints ship.

## Why this matters

Subscriptions overcharge people who use a little and undercharge people who use a lot. Streaming micropayments price exactly what is consumed, second by second, with no signup and no card on file. That is only practical when a payment costs a fraction of a cent and settles instantly, which is exactly what this rail provides, and it stays secure in the quantum era.

Build something with this and apply to the Builders League at soqu.org/build/apply.
