// Demo: streaming micropayments for a video clip.
//
//   LOCAL (default):   npm start                   in-memory simulation
//   LIVE (stagenet):   LSP_URL=... npm start         real channel + real payments
//
// A viewer pays per second of content. Stop watching at any second and you stop
// paying. Swap the clip for your stream, your API meter, or your compute job.

import "dotenv/config";
import { PaymentStream } from "./streamer.js";

const fmt = (sat: number): string => `${(sat / 1e8).toFixed(8)} SOQ`;

async function main(): Promise<void> {
  const lspUrl = process.env.LSP_URL;
  console.log(lspUrl ? `LIVE mode. Stagenet LSP: ${lspUrl}\n` : "LOCAL simulation. Set LSP_URL in .env for real payments.\n");

  const RATE = 1000; // satoshis per second (0.00001 SOQ/s)
  const DURATION = 5; // seconds of content

  console.log(`Streaming a ${DURATION}s clip at ${RATE} sat/second. You pay only for what you watch.\n`);

  const stream = await PaymentStream.create({
    lspUrl,
    ratePerSecondSat: RATE,
    capacitySat: 1_000_000_000, // 10 SOQ
    label: "viewer",
  });

  const result = await stream.run(DURATION, (s) => {
    console.log(`  ${String(s.second).padStart(2)}s   paid ${s.paidSat} sat   total ${s.totalPaidSat} sat   balance ${fmt(s.remainingSat)}`);
  });

  console.log(`\nStream ${result.reason}. Watched ${result.secondsStreamed}s, paid ${result.totalPaidSat} sat total (${fmt(result.totalPaidSat)}).`);
  console.log("Stop at any second and you stop paying. That is the point of streaming.");
  await stream.close();
  console.log(lspUrl ? "Channel closed and settled on L1." : "Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
