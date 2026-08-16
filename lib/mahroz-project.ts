import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class MahrozProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==========================================
    // S3 BUCKET
    // ==========================================

    const sitesBucket = new s3.Bucket(this, "SentinelSitesBucket", {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Upload sites.json to S3
    new s3deploy.BucketDeployment(this, "DeploySiteConfig", {
      sources: [s3deploy.Source.asset("config")],
      destinationBucket: sitesBucket,
    });

    // ==========================================
    // LAMBDA
    // ==========================================

    const monitorLambda = new lambda.NodejsFunction(
      this,
      "SentinelMonitorLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,

        entry: "lambda/monitor.ts",

        handler: "handler",

        timeout: cdk.Duration.seconds(15),

        memorySize: 256,

        environment: {
          SITES_BUCKET: sitesBucket.bucketName,

          SITES_KEY: "sites.json",
        },
      },
    );
    // ==========================================
// EVENTBRIDGE - RUN EVERY 5 MINUTES
// ==========================================

const monitorSchedule = new events.Rule(
  this,
  'SentinelMonitorSchedule',
  {
    schedule: events.Schedule.rate(
      cdk.Duration.minutes(5)
    ),
  }
);

monitorSchedule.addTarget(
  new targets.LambdaFunction(
    monitorLambda
  )
);

    // Lambda can read sites.json
    sitesBucket.grantRead(monitorLambda);

    // Lambda can publish CloudWatch metrics
    monitorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,

        actions: ["cloudwatch:PutMetricData"],

        resources: ["*"],
      }),
    );

    // ==========================================
    // OUTPUTS
    // ==========================================

    new cdk.CfnOutput(this, "LambdaName", {
      value: monitorLambda.functionName,
    });

    new cdk.CfnOutput(this, "SitesBucketName", {
      value: sitesBucket.bucketName,
    });

    // ==========================================
    // CLOUDWATCH DASHBOARD
    // ==========================================

    const dashboard =
  new cloudwatch.Dashboard(
    this,
    'SentinelDashboard',
    {
      dashboardName:
        `Sentinel-Website-Health-${cdk.Stack.of(this).region}`,
    }
  );

    // Sites being monitored
    const sites = ["Example", "Google", "AWS"];

    // ==========================================
    // AVAILABILITY METRICS
    // ==========================================

    const availabilityMetrics = sites.map(
      (site) =>
        new cloudwatch.Metric({
          namespace: "Sentinel/WebsiteHealth",

          metricName: "Availability",

          dimensionsMap: {
            Site: site,
          },

          statistic: "Average",

          period: cdk.Duration.minutes(5),
        }),
    );

    // ==========================================
    // LATENCY METRICS
    // ==========================================

    const latencyMetrics = sites.map(
      (site) =>
        new cloudwatch.Metric({
          namespace: "Sentinel/WebsiteHealth",

          metricName: "Latency",

          dimensionsMap: {
            Site: site,
          },

          statistic: "Average",

          period: cdk.Duration.minutes(5),
        }),
    );

    // ==========================================
    // DASHBOARD WIDGETS
    // ==========================================

    const dnsMetrics = sites.map(
      (site) =>
        new cloudwatch.Metric({
          namespace: "Sentinel/WebsiteHealth",
          metricName: "DNSResolutionTime",
          dimensionsMap: {
            Site: site,
          },
          statistic: "Average",
          period: cdk.Duration.minutes(5),
        }),
    );

    const sslMetrics = sites.map(
  (site) =>
    new cloudwatch.Metric({
      namespace: 'Sentinel/WebsiteHealth',
      metricName: 'SSLCertificateDaysRemaining',
      dimensionsMap: {
        Site: site,
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    })
);

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Website Availability",

        left: availabilityMetrics,

        leftYAxis: {
          min: 0,
          max: 1,
        },

        width: 12,
      }),

      new cloudwatch.GraphWidget({
        title: "Website Latency",

        left: latencyMetrics,

        leftYAxis: {
          min: 0,
        },

        width: 12,
      }),

      new cloudwatch.GraphWidget({
        title: "DNS Resolution Time",
        left: dnsMetrics,
        leftYAxis: {
          min: 0,
        },
        width: 12,
      }),
      new cloudwatch.GraphWidget({
  title: 'SSL Certificate Days Remaining',
  left: sslMetrics,
  leftYAxis: {
    min: 0,
  },
  width: 12,
})
    );
  }
}
