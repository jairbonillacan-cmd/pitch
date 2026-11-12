import fs from "node:fs";
import {
  DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR,
  applyAvailabilityDeltaToProbs,
  computeLineupAvailabilityDelta,
  predictMotorA,
  predictMotorAWithAvailability,
  softmax3,
} from "../../../../src/domain/prediction/engine.ts";
import type {
  ModelArtifact,
  ProspectiveAvailabilityPriorConfig,
  SnapshotRow,
  TeamAvailabilityContext,
} from "../../../../src/domain/prediction/types.ts";

interface BridgeInput {
  modelPath: string;
  deltaCases: Array<{
    homeTeamCtx?: TeamAvailabilityContext | null;
    awayTeamCtx?: TeamAvailabilityContext | null;
    config?: ProspectiveAvailabilityPriorConfig | null;
  }>;
  probShiftCases: Array<{
    probs: [number, number, number];
    delta: number;
  }>;
  motorACases: Array<{
    row: SnapshotRow;
    availability:
      | number
      | {
          homeTeamCtx?: TeamAvailabilityContext | null;
          awayTeamCtx?: TeamAvailabilityContext | null;
        };
  }>;
}

const args = process.argv.slice(2);
const inIdx = args.indexOf("--input");
const rawInput =
  inIdx >= 0 && args[inIdx + 1]
    ? fs.readFileSync(args[inIdx + 1]!, "utf8")
    : fs.readFileSync(0, "utf8");

const payload = JSON.parse(rawInput) as BridgeInput;
const model = JSON.parse(fs.readFileSync(payload.modelPath, "utf8")) as ModelArtifact;

const deltaResults = payload.deltaCases.map((c) =>
  computeLineupAvailabilityDelta(c.homeTeamCtx, c.awayTeamCtx, c.config),
);

const probShiftResults = payload.probShiftCases.map((c) =>
  applyAvailabilityDeltaToProbs(c.probs, c.delta),
);

const motorAResults = payload.motorACases.map((c) => ({
  base: predictMotorA(c.row, model),
  withAvailability: predictMotorAWithAvailability(c.row, model, c.availability),
}));

const softmaxCheck = softmax3([0.35, -0.1, -0.25]);

process.stdout.write(
  JSON.stringify({
    defaultPrior: DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR,
    softmaxCheck,
    deltaResults,
    probShiftResults,
    motorAResults,
  }) + "\n",
);
