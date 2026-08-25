import https from "https";
import dns from "dns/promises";
import tls from "tls";

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";

const s3 = new S3Client({});
const cloudwatch = new CloudWatchClient({});

const dynamodb = new DynamoDBClient({});

const documentClient = DynamoDBDocumentClient.from(dynamodb);

interface Site {
  name: string;
  url: string;
}

interface SiteConfig {
  sites: Site[];
}

/**
 * Measure DNS resolution time for a hostname.
 */
async function measureDnsResolution(hostname: string): Promise<number> {
  const startTime = Date.now();

  await dns.lookup(hostname);

  return Date.now() - startTime;
}

/**
 * Get the number of days remaining
 * before the SSL certificate expires.
 */
async function getCertificateDaysRemaining(hostname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: 10000,
      },
      () => {
        try {
          const certificate = socket.getPeerCertificate();

          if (!certificate || !certificate.valid_to) {
            socket.destroy();

            reject(new Error("SSL certificate information unavailable"));

            return;
          }

          const expiryDate = new Date(certificate.valid_to);

          const now = new Date();

          const millisecondsRemaining = expiryDate.getTime() - now.getTime();

          const daysRemaining = millisecondsRemaining / (1000 * 60 * 60 * 24);

          socket.destroy();

          resolve(Number(Math.max(0, daysRemaining).toFixed(2)));
        } catch (error) {
          socket.destroy();
          reject(error);
        }
      },
    );

    socket.on("error", reject);

    socket.on("timeout", () => {
      socket.destroy();

      reject(new Error("SSL certificate check timed out"));
    });
  });
}

/**
 * Publish website monitoring metrics
 * to CloudWatch.
 */
async function publishMetrics(
  site: Site,
  available: boolean,
  latencyMs: number,
  dnsResolutionMs: number,
  sslCertificateDaysRemaining: number,
) {
  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: "Sentinel/WebsiteHealth",

      MetricData: [
        // Availability
        {
          MetricName: "Availability",

          Value: available ? 1 : 0,

          Unit: "Count",

          Dimensions: [
            {
              Name: "Site",
              Value: site.name,
            },
          ],
        },

        // HTTP latency
        {
          MetricName: "Latency",

          Value: latencyMs,

          Unit: "Milliseconds",

          Dimensions: [
            {
              Name: "Site",
              Value: site.name,
            },
          ],
        },

        // DNS resolution time
        {
          MetricName: "DNSResolutionTime",

          Value: dnsResolutionMs,

          Unit: "Milliseconds",

          Dimensions: [
            {
              Name: "Site",
              Value: site.name,
            },
          ],
        },

        // SSL certificate days remaining
        {
          MetricName: "SSLCertificateDaysRemaining",

          Value: sslCertificateDaysRemaining,

          Unit: "Count",

          Dimensions: [
            {
              Name: "Site",
              Value: site.name,
            },
          ],
        },
      ],
    }),
  );
}

async function logIncident(
  site: Site,
  latencyMs: number,
  statusCode: number | null,
  error?: string,
) {
  const tableName = process.env.INCIDENTS_TABLE;

  if (!tableName) {
    throw new Error("INCIDENTS_TABLE is not configured");
  }

  const incidentId = `${site.name}-${Date.now()}`;

  await documentClient.send(
    new PutCommand({
      TableName: tableName,

      Item: {
        incidentId,

        siteName: site.name,

        url: site.url,

        status: "DOWN",

        statusCode,

        latencyMs,

        error: error ?? null,

        detectedAt: new Date().toISOString(),
      },
    }),
  );

  console.log("Incident logged:", incidentId);
}

export const handler = async () => {
  const bucket = process.env.SITES_BUCKET;
  const key = process.env.SITES_KEY;

  if (!bucket || !key) {
    throw new Error("S3 configuration is missing");
  }

  // ==========================================
  // READ sites.json FROM S3
  // ==========================================

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const result = await s3.send(command);

  const body = await result.Body?.transformToString();

  if (!body) {
    throw new Error("Empty sites.json file");
  }

  const config: SiteConfig = JSON.parse(body);

  if (!Array.isArray(config.sites)) {
    throw new Error("Invalid sites.json format");
  }

  const results = [];

  // ==========================================
  // CHECK EVERY WEBSITE
  // ==========================================

  for (const site of config.sites) {
    const startTime = Date.now();

    try {
      // ========================================
      // PARSE URL
      // ========================================

      const parsedUrl = new URL(site.url);

      // ========================================
      // DNS RESOLUTION
      // ========================================

      const dnsResolutionMs = await measureDnsResolution(parsedUrl.hostname);

      // ========================================
      // SSL CERTIFICATE
      // ========================================

      const sslCertificateDaysRemaining = await getCertificateDaysRemaining(
        parsedUrl.hostname,
      );

      // ========================================
      // HTTPS HEALTH CHECK
      // ========================================

      const response = await checkWebsite(site.url);

      const latencyMs = Date.now() - startTime;

      const available = response.statusCode >= 200 && response.statusCode < 400;

      // ========================================
      // HEALTH RESULT
      // ========================================

      const health = {
        name: site.name,

        url: site.url,

        available,

        statusCode: response.statusCode,

        latencyMs,

        dnsResolutionMs,

        sslCertificateDaysRemaining,
      };

      if (!available) {
        await logIncident(
          site,
          latencyMs,
          response.statusCode,
          `HTTP ${response.statusCode}`,
        );
      }

      // ========================================
      // PUBLISH CLOUDWATCH METRICS
      // ========================================

      await publishMetrics(
        site,
        available,
        latencyMs,
        dnsResolutionMs,
        sslCertificateDaysRemaining,
      );

      console.log("Website health check:", health);

      results.push(health);
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      const health = {
        name: site.name,

        url: site.url,

        available: false,

        statusCode: null,

        latencyMs,

        dnsResolutionMs: null,

        sslCertificateDaysRemaining: null,

        error: error instanceof Error ? error.message : "Unknown error",
      };

      await logIncident(site, latencyMs, null, health.error);

      // ========================================
      // PUBLISH FAILED WEBSITE METRICS
      // ========================================

      await publishMetrics(site, false, latencyMs, 0, 0);

      console.error("Website health check failed:", health);

      results.push(health);
    }
  }

  // ==========================================
  // RETURN RESULTS
  // ==========================================

  return {
    statusCode: 200,

    body: JSON.stringify({
      checkedAt: new Date().toISOString(),

      sites: results,
    }),
  };
};

/**
 * Perform HTTPS request and return HTTP status.
 */
function checkWebsite(url: string): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      response.on("data", () => {});

      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
        });
      });
    });

    request.on("error", reject);

    request.setTimeout(10000, () => {
      request.destroy();

      reject(new Error("Request timed out"));
    });
  });
}
