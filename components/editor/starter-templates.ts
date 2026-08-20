import { SHAPE_DEFAULT_SIZES } from "@/lib/canvas-shapes"
import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  NODE_COLORS,
  type CanvasEdge,
  type CanvasNode,
  type NodeColorPair,
  type NodeShape,
} from "@/types/canvas"

/**
 * Fixed, code-defined library of starter canvas templates — spec 18. No
 * template saving, no custom/user-authored templates, no server persistence
 * (`architecture-context.md`'s Starter System Designs: "resolved by template
 * ID at import time", satisfied entirely by this plain array). See spec 18's
 * Analyst Brief, Concrete deliverables and Out-of-scope callouts.
 */

export interface CanvasTemplate {
  id: string
  name: string
  description: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/**
 * Node/edge IDs below are static, human-readable strings authored directly
 * in this file — not `lib/canvas-shapes.ts#generateNodeId()`, whose
 * timestamp+counter recipe is for *dynamically dropped* nodes and produces a
 * different ID on every call, wrong for a hardcoded literal that needs a
 * stable ID at authoring time. IDs only need to be unique *within* a single
 * template — see spec 18's Analyst Brief, Open Questions #3.
 */

/**
 * Builds a single template node from its shape/label/position, using
 * `SHAPE_DEFAULT_SIZES` for sizing (visual consistency with hand-placed
 * nodes) and defaulting to the first `NODE_COLORS` pair (the same default
 * every dropped node starts with) when no color pair is given.
 */
function templateNode(
  id: string,
  shape: NodeShape,
  label: string,
  position: { x: number; y: number },
  colorPair: NodeColorPair = NODE_COLORS[0],
): CanvasNode {
  const size = SHAPE_DEFAULT_SIZES[shape]
  return {
    id,
    type: CANVAS_NODE_TYPE,
    position,
    width: size.width,
    height: size.height,
    data: {
      label,
      color: colorPair.color,
      textColor: colorPair.textColor,
      shape,
    },
  }
}

/** Builds a single template edge — a plain connection, no label. */
function templateEdge(id: string, source: string, target: string): CanvasEdge {
  return {
    id,
    type: CANVAS_EDGE_TYPE,
    source,
    target,
    data: {},
  }
}

const [DEFAULT, BLUE, PURPLE, ORANGE, , , GREEN, TEAL] = NODE_COLORS

const microservicesTemplate: CanvasTemplate = {
  id: "microservices",
  name: "Microservices",
  description:
    "A client talking to an API gateway that fans out to independent services backed by a shared database.",
  nodes: [
    templateNode("microservices-client", "circle", "Client", { x: 340, y: 0 }, DEFAULT),
    templateNode("microservices-api-gateway", "hexagon", "API Gateway", { x: 310, y: 140 }, BLUE),
    templateNode("microservices-auth-service", "pill", "Auth Service", { x: 40, y: 300 }, PURPLE),
    templateNode("microservices-orders-service", "pill", "Orders Service", { x: 280, y: 300 }, PURPLE),
    templateNode("microservices-inventory-service", "pill", "Inventory Service", { x: 520, y: 300 }, PURPLE),
    templateNode("microservices-database", "cylinder", "Database", { x: 350, y: 440 }, TEAL),
  ],
  edges: [
    templateEdge("microservices-edge-client-gateway", "microservices-client", "microservices-api-gateway"),
    templateEdge("microservices-edge-gateway-auth", "microservices-api-gateway", "microservices-auth-service"),
    templateEdge("microservices-edge-gateway-orders", "microservices-api-gateway", "microservices-orders-service"),
    templateEdge(
      "microservices-edge-gateway-inventory",
      "microservices-api-gateway",
      "microservices-inventory-service",
    ),
    templateEdge("microservices-edge-orders-database", "microservices-orders-service", "microservices-database"),
    templateEdge(
      "microservices-edge-inventory-database",
      "microservices-inventory-service",
      "microservices-database",
    ),
  ],
}

const cicdPipelineTemplate: CanvasTemplate = {
  id: "cicd-pipeline",
  name: "CI/CD Pipeline",
  description: "A push-triggered build and test pipeline gated by a quality check before staged deployment.",
  nodes: [
    templateNode("cicd-push", "circle", "Push", { x: 0, y: 160 }, DEFAULT),
    templateNode("cicd-build", "rectangle", "Build", { x: 140, y: 140 }, BLUE),
    templateNode("cicd-test", "rectangle", "Test", { x: 360, y: 140 }, BLUE),
    templateNode("cicd-quality-gate", "diamond", "Quality Gate", { x: 580, y: 100 }, ORANGE),
    templateNode("cicd-deploy-staging", "pill", "Deploy Staging", { x: 800, y: 150 }, GREEN),
    templateNode("cicd-deploy-production", "pill", "Deploy Production", { x: 1020, y: 150 }, GREEN),
    templateNode("cicd-artifact-registry", "cylinder", "Artifact Registry", { x: 380, y: 280 }, TEAL),
  ],
  edges: [
    templateEdge("cicd-edge-push-build", "cicd-push", "cicd-build"),
    templateEdge("cicd-edge-build-test", "cicd-build", "cicd-test"),
    templateEdge("cicd-edge-test-quality-gate", "cicd-test", "cicd-quality-gate"),
    templateEdge("cicd-edge-quality-gate-staging", "cicd-quality-gate", "cicd-deploy-staging"),
    templateEdge("cicd-edge-staging-production", "cicd-deploy-staging", "cicd-deploy-production"),
    templateEdge("cicd-edge-build-artifact-registry", "cicd-build", "cicd-artifact-registry"),
    templateEdge("cicd-edge-artifact-registry-production", "cicd-artifact-registry", "cicd-deploy-production"),
  ],
}

const eventDrivenTemplate: CanvasTemplate = {
  id: "event-driven-system",
  name: "Event-Driven System",
  description: "Producers publish events onto a shared bus that fans out to consumers and an analytics store.",
  nodes: [
    templateNode("event-driven-order-service", "pill", "Order Service", { x: 0, y: 0 }, PURPLE),
    templateNode("event-driven-payment-service", "pill", "Payment Service", { x: 0, y: 120 }, PURPLE),
    templateNode("event-driven-event-bus", "hexagon", "Event Bus", { x: 260, y: 40 }, BLUE),
    templateNode("event-driven-inventory-service", "pill", "Inventory Service", { x: 500, y: -40 }, GREEN),
    templateNode("event-driven-notification-service", "pill", "Notification Service", { x: 500, y: 80 }, GREEN),
    templateNode("event-driven-analytics-store", "cylinder", "Analytics Store", { x: 500, y: 200 }, TEAL),
  ],
  edges: [
    templateEdge("event-driven-edge-order-bus", "event-driven-order-service", "event-driven-event-bus"),
    templateEdge("event-driven-edge-payment-bus", "event-driven-payment-service", "event-driven-event-bus"),
    templateEdge("event-driven-edge-bus-inventory", "event-driven-event-bus", "event-driven-inventory-service"),
    templateEdge(
      "event-driven-edge-bus-notification",
      "event-driven-event-bus",
      "event-driven-notification-service",
    ),
    templateEdge("event-driven-edge-bus-analytics", "event-driven-event-bus", "event-driven-analytics-store"),
  ],
}

/** At least 3 built-in templates — spec 18's own suggested set. */
export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = [
  microservicesTemplate,
  cicdPipelineTemplate,
  eventDrivenTemplate,
]
