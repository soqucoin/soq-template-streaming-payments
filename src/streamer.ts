// PaymentStream
// -------------
// Streaming micropayments: pay a small amount every tick as a service is consumed,
// so the payer only pays for what they actually use. Built on the same Lightning
// channel as a single payment, just called on a timer.
//
// Two modes, same interface:
//   LIVE  (pass an lspUrl): opens a real channel on stagenet and pays each tick.
//   LOCAL (no lspUrl): an in-memory simulation, no network. Labelled in output.

import { SoqLightning, mlDsaKeygen, onchain } from "soq-lightning-sdk";

const toHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

export interface StreamOptions {
  /** Stagenet LSP base URL. If omitted, runs a LOCAL simulation. */
  lspUrl?: string;
  /** Price of the stream, in satoshis per second. */
  ratePerSecondSat: number;
  /** Channel capacity in satoshis. Default 10 SOQ. */
  capacitySat?: number;
  settlementAddress?: string;
  label?: string;
}

export interface TickState {
  second: number;
  paidSat: number;
  totalPaidSat: number;
  remainingSat: number;
  live: boolean;
}

export interface StreamResult {
  totalPaidSat: number;
  secondsStreamed: number;
  reason: "completed" | "stopped" | "insufficient balance";
}

export class PaymentStream {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;

  private constructor(
    readonly live: boolean,
    readonly ratePerSecondSat: number,
    private readonly ln: SoqLightning | null,
    private readonly channelId: string | null,
    private localBalance: number,
  ) {}

  static async create(opts: StreamOptions): Promise<PaymentStream> {
    if (!Number.isInteger(opts.ratePerSecondSat) || opts.ratePerSecondSat <= 0) {
      throw new Error("ratePerSecondSat must be a positive integer");
    }
    const capacity = opts.capacitySat ?? 1_000_000_000; // 10 SOQ
    const wallet = mlDsaKeygen(); // post-quantum identity

    if (!opts.lspUrl) {
      return new PaymentStream(false, opts.ratePerSecondSat, null, null, capacity);
    }

    const ln = new SoqLightning({ baseUrl: opts.lspUrl });
    const address = opts.settlementAddress ?? onchain.deriveAddress(wallet.publicKey, "ssq");
    const ch = await ln.fundAndOpen({ pubKeyHex: toHex(wallet.publicKey), address, capacitySat: capacity });
    return new PaymentStream(true, opts.ratePerSecondSat, ln, ch.channel_id, ch.initiator_balance_sat);
  }

  private async currentBalance(): Promise<number> {
    if (!this.live) return this.localBalance;
    const ch = await this.ln!.channel(this.channelId!);
    return ch.initiator_balance_sat;
  }

  private async payTick(amountSat: number): Promise<number> {
    if (!this.live) {
      this.localBalance -= amountSat;
      return this.localBalance;
    }
    const after = await this.ln!.pay(this.channelId!, amountSat);
    return after.initiator_balance_sat;
  }

  /**
   * Stream for up to maxSeconds, paying the rate each tick. Resolves when it ends:
   * the duration is reached, stop() is called, or the balance runs low. onTick fires
   * once per paid tick. Uses a self-scheduling timer so a slow live payment never
   * overlaps the next tick.
   */
  run(maxSeconds: number, onTick: (s: TickState) => void, tickMs = 1000): Promise<StreamResult> {
    return new Promise((resolve) => {
      let second = 0;
      let total = 0;
      this.stopping = false;

      const done = (reason: StreamResult["reason"]): void => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        resolve({ totalPaidSat: total, secondsStreamed: second, reason });
      };

      const tick = async (): Promise<void> => {
        if (this.stopping) return done("stopped");
        const balance = await this.currentBalance();
        if (balance < this.ratePerSecondSat) return done("insufficient balance");

        const remaining = await this.payTick(this.ratePerSecondSat);
        second += 1;
        total += this.ratePerSecondSat;
        onTick({ second, paidSat: this.ratePerSecondSat, totalPaidSat: total, remainingSat: remaining, live: this.live });

        if (second >= maxSeconds) return done("completed");
        this.timer = setTimeout(() => void tick(), tickMs);
      };

      this.timer = setTimeout(() => void tick(), tickMs);
    });
  }

  /** Request the stream to stop after the current tick. */
  stop(): void {
    this.stopping = true;
  }

  async balanceSat(): Promise<number> {
    return this.currentBalance();
  }

  async close(): Promise<void> {
    if (this.live && this.ln && this.channelId) {
      await this.ln.close(this.channelId);
    }
  }
}
