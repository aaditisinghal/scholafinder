/**
 * Solana reward dispatcher — deterministic, not an LLM agent. Fires a small devnet
 * transfer as a token of reward once a student's application status flips to "submitted".
 * Devnet only: this moves no real value, which matters for a hackathon demo.
 */
import "dotenv/config";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from "@solana/web3.js";
import { pool } from "../db/pool.js";

const CLUSTER = (process.env.SOLANA_CLUSTER as "devnet" | "testnet") || "devnet";
const REWARD_AMOUNT_SOL = Number(process.env.SOLANA_REWARD_AMOUNT_SOL ?? "0.01");

function loadRewardWallet(): Keypair {
  const raw = process.env.SOLANA_REWARD_WALLET_SECRET_KEY;
  if (!raw) throw new Error("SOLANA_REWARD_WALLET_SECRET_KEY is not set (JSON array of 64 numbers, from `solana-keygen new`).");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function sendSubmissionReward(studentId: string, universityId: string, studentWalletAddress: string): Promise<string> {
  if (CLUSTER !== "devnet") {
    throw new Error("Refusing to send on a non-devnet cluster — this reward flow is devnet-only by design.");
  }

  const connection = new Connection(clusterApiUrl(CLUSTER), "confirmed");
  const fromWallet = loadRewardWallet();
  const toPubkey = new PublicKey(studentWalletAddress);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO rewards (student_id, university_id, amount_sol, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
    [studentId, universityId, REWARD_AMOUNT_SOL]
  );
  const rewardId = rows[0].id;

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey,
        lamports: Math.round(REWARD_AMOUNT_SOL * LAMPORTS_PER_SOL),
      })
    );
    const signature = await sendAndConfirmTransaction(connection, tx, [fromWallet]);
    await pool.query(`UPDATE rewards SET status = 'sent', tx_signature = $1 WHERE id = $2`, [signature, rewardId]);
    return signature;
  } catch (err) {
    await pool.query(`UPDATE rewards SET status = 'failed' WHERE id = $1`, [rewardId]);
    throw err;
  }
}
