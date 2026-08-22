import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const exporterConfigured = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

export const TelemetryLive = exporterConfigured
  ? NodeSdk.layer(() => ({
      resource: {
        serviceName: "coffee-journal-api",
        serviceVersion: process.env.OTEL_SERVICE_VERSION ?? "0.0.1",
        attributes: {
          "service.namespace": "coffee-journal",
          "service.instance.id": process.env.HOSTNAME ?? String(process.pid),
          "deployment.environment.name":
            process.env.NODE_ENV ?? "development",
        },
      },
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
      }),
      logRecordProcessor: new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter(),
      }),
    }))
  : NodeSdk.layerEmpty;
