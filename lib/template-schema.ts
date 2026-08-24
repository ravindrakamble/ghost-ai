import { z } from "zod"
import { CANVAS_SHAPES } from "@/lib/canvas-shapes"

/**
 * Dedicated, full-fidelity Zod schemas for a saved `CustomTemplate`'s
 * node/edge JSON (spec 33) — validating `POST /api/templates`'s request body
 * before it's ever uploaded to Blob.
 *
 * Deliberately **not** a reuse of spec 27's `GenerateSpecGraphNodeSchema`/
 * `GenerateSpecGraphEdgeSchema` (`trigger/generate-spec.ts`) — those are a
 * narrow structural summary (`{ id, label, shape, x, y }`) purpose-built for
 * spec-generation prompt input, and drop `color`/`textColor`/`width`/
 * `height` entirely. Reusing them here would silently corrupt re-import
 * fidelity: a saved-and-reimported template would lose its authored colors
 * and sizing. See spec 33's Analyst Brief, Concrete deliverables #3 and Open
 * Questions #2.
 *
 * Shape validates full re-import fidelity — everything
 * `components/editor/starter-templates.ts#CanvasTemplate`'s own
 * `nodes`/`edges` fields need to round-trip cleanly through
 * `handleImportTemplate`'s existing clear-then-add mechanism unchanged.
 * `z.object(...)` (not `.strict()`) is used deliberately: a live React Flow
 * node/edge object may carry additional runtime-only fields (e.g.
 * `selected`, `measured`, `sourceHandle`) that aren't essential to re-import
 * and shouldn't fail an otherwise-valid save — Zod's own default already
 * strips unrecognized keys rather than erroring.
 */

const CustomTemplatePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

export const CustomTemplateNodeDataSchema = z.object({
  label: z.string(),
  color: z.string().min(1),
  textColor: z.string().min(1),
  shape: z.enum(CANVAS_SHAPES as [(typeof CANVAS_SHAPES)[number], ...(typeof CANVAS_SHAPES)[number][]]),
})

export const CustomTemplateNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: CustomTemplatePositionSchema,
  width: z.number().finite().optional(),
  height: z.number().finite().optional(),
  data: CustomTemplateNodeDataSchema,
})

export const CustomTemplateEdgeDataSchema = z.object({
  label: z.string().optional(),
})

export const CustomTemplateEdgeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  data: CustomTemplateEdgeDataSchema.optional(),
})

/**
 * `POST /api/templates`'s full request-body schema. `name` is required,
 * trimmed, non-empty; `description` is optional, trimmed, no minimum or
 * maximum length — no existing precedent in this codebase enforces a max
 * length on any comparable field (`POST /api/projects` included), so one
 * isn't invented here either. See spec 33's Analyst Brief, Open Questions #5.
 */
export const CreateCustomTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  nodes: z.array(CustomTemplateNodeSchema),
  edges: z.array(CustomTemplateEdgeSchema),
})

export type CreateCustomTemplateInput = z.infer<typeof CreateCustomTemplateSchema>
