export * as ConfigCompaction from "./compaction"

import { Schema } from "effect"
import { NonNegativeInt } from "../schema"

export class Keep extends Schema.Class<Keep>("ConfigV2.Compaction.Keep")({
  tokens: NonNegativeInt.pipe(Schema.optional),
}) {}

export const CheckpointStyle = Schema.Literals(["summary", "continuation"])
export type CheckpointStyle = typeof CheckpointStyle.Type

export class Info extends Schema.Class<Info>("ConfigV2.Compaction")({
  auto: Schema.Boolean.pipe(Schema.optional),
  prune: Schema.Boolean.pipe(Schema.optional),
  keep: Keep.pipe(Schema.optional),
  buffer: NonNegativeInt.pipe(Schema.optional),
  summary_max_tokens: NonNegativeInt.pipe(Schema.optional).annotate({
    description: "Maximum tokens for compaction summary generation (default: 4096 when unset)",
  }),
  checkpoint_style: CheckpointStyle.pipe(Schema.optional).annotate({
    description:
      'Compaction checkpoint template style. "summary" is the upstream Objective/Completed format (default). "continuation" uses Goal/Durable/Active/Next/Working Files.',
  }),
}) {}
