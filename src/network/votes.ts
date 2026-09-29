export type Ballot = {
  round: string;
  playerId: string;
  target: string;
  nonce: string;
  hash: string;
};
export async function ballotHash(
  round: string,
  playerId: string,
  target: string,
  nonce: string,
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([round, playerId, target, nonce])),
  );
  return Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function makeBallot(
  round: string,
  playerId: string,
  target: string,
): Promise<Ballot> {
  const nonce = crypto.randomUUID();
  return {
    round,
    playerId,
    target,
    nonce,
    hash: await ballotHash(round, playerId, target, nonce),
  };
}
