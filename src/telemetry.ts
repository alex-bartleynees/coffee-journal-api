import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect, Layer } from "effect";
import { TelemetryConfig } from "./telemetry-config.js";

export const TelemetryLive = Layer.unwrapEffect(
  Effect.map(TelemetryConfig, (settings) => {
    if (!settings.enabled) return NodeSdk.layerEmpty;
    const url = settings.endpoint.toString();
    return NodeSdk.layer(() => ({
      resource: {
        serviceName: "coffee-journal-api",
        serviceVersion: settings.serviceVersion,
        attributes: {
          "service.namespace": "coffee-journal",
          "service.instance.id": settings.instanceId,
          "deployment.environment.name": settings.deploymentEnvironment,
        },
      },
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url })),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url }),
      }),
      logRecordProcessor: new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url }),
      }),
    }));
  }),
);
