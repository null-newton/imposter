import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBallot, ballotHash } from "../src/network/votes.ts";
test("vote commitments hide choices and bind the reveal to round, player and nonce", async () => {
  const ballot = await makeBallot("round", "player", "Blue");
  assert.equal(
    ballot.hash,
    await ballotHash(
      ballot.round,
      ballot.playerId,
      ballot.target,
      ballot.nonce,
    ),
  );
  assert.notEqual(
    ballot.hash,
    await ballotHash("round", "player", "Red", ballot.nonce),
  );
  assert.notEqual(
    ballot.hash,
    await ballotHash("other-round", "player", "Blue", ballot.nonce),
  );
  assert.notEqual(
    ballot.hash,
    (await makeBallot("round", "player", "Blue")).hash,
  );
});
