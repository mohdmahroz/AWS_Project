import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";

import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

import * as iam from "aws-cdk-lib/aws-iam";

import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";

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

    // ==========================================
    // PHASE 3 - DYNAMODB INCIDENT TABLE
    // ==========================================

    const incidentsTable = new dynamodb.Table(this, "SentinelIncidentsTable", {
      partitionKey: {
        name: "incidentId",
        type: dynamodb.AttributeType.STRING,
      },

      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      encryption: dynamodb.TableEncryption.AWS_MANAGED,

      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ==========================================
    // UPLOAD sites.json TO S3
    // ==========================================

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

          INCIDENTS_TABLE: incidentsTable.tableName,
        },
      },
    );

    // ==========================================
    // EVENTBRIDGE
    // RUN EVERY 5 MINUTES
    // ==========================================

    const monitorSchedule = new events.Rule(this, "SentinelMonitorSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    monitorSchedule.addTarget(new targets.LambdaFunction(monitorLambda));

    // ==========================================
    // IAM - READ S3
    // ==========================================

    sitesBucket.grantRead(monitorLambda);

    incidentsTable.grantWriteData(monitorLambda);

    // ==========================================
    // IAM - PUBLISH CLOUDWATCH METRICS
    // ==========================================

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

    new cdk.CfnOutput(this, "IncidentsTableName", {
      value: incidentsTable.tableName,
    });

    // ==========================================
    // CLOUDWATCH DASHBOARD
    // ==========================================

    const dashboard = new cloudwatch.Dashboard(this, "SentinelDashboard", {
      dashboardName: `Sentinel-Website-Health-${cdk.Stack.of(this).region}`,
    });

    // ==========================================
    // SITES BEING MONITORED
    // ==========================================

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
    // DNS METRICS
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

    // ==========================================
    // SSL METRICS
    // ==========================================

    const sslMetrics = sites.map(
      (site) =>
        new cloudwatch.Metric({
          namespace: "Sentinel/WebsiteHealth",

          metricName: "SSLCertificateDaysRemaining",

          dimensionsMap: {
            Site: site,
          },

          statistic: "Average",

          period: cdk.Duration.minutes(5),
        }),
    );

    // ==========================================
    // PHASE 3
    // AVAILABILITY ALARMS
    // ==========================================

    const availabilityAlarms = sites.map((site) => {
      const availabilityMetric = new cloudwatch.Metric({
        namespace: "Sentinel/WebsiteHealth",

        metricName: "Availability",

        dimensionsMap: {
          Site: site,
        },

        statistic: "Average",

        period: cdk.Duration.minutes(5),
      });

      return new cloudwatch.Alarm(this, `${site}AvailabilityAlarm`, {
        metric: availabilityMetric,

        threshold: 1,

        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,

        evaluationPeriods: 1,

        datapointsToAlarm: 1,

        alarmDescription: `${site} website is unavailable`,
      });
    });

    // ==========================================
    // PHASE 3
    // LATENCY ALARMS
    // ==========================================

    const latencyAlarms = sites.map((site) => {
      const latencyMetric = new cloudwatch.Metric({
        namespace: "Sentinel/WebsiteHealth",

        metricName: "Latency",

        dimensionsMap: {
          Site: site,
        },

        statistic: "Average",

        period: cdk.Duration.minutes(5),
      });

      return new cloudwatch.Alarm(this, `${site}LatencyAlarm`, {
        metric: latencyMetric,

        threshold: 1000,

        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,

        evaluationPeriods: 1,

        datapointsToAlarm: 1,

        alarmDescription: `${site} website latency is above 1000 milliseconds`,
      });
    });

    // ==========================================
    // PHASE 3
    // SSL CERTIFICATE ALARMS
    // ==========================================

    const sslAlarms = sites.map((site) => {
      const sslMetric = new cloudwatch.Metric({
        namespace: "Sentinel/WebsiteHealth",

        metricName: "SSLCertificateDaysRemaining",

        dimensionsMap: {
          Site: site,
        },

        statistic: "Minimum",

        period: cdk.Duration.minutes(5),
      });

      return new cloudwatch.Alarm(this, `${site}SSLAlarm`, {
        metric: sslMetric,

        threshold: 30,

        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,

        evaluationPeriods: 1,

        datapointsToAlarm: 1,

        alarmDescription: `${site} SSL certificate expires in less than 30 days`,
      });
    });

    // ==========================================
    // PHASE 3
    // SNS NOTIFICATIONS
    // ==========================================

    const alertTopic = new sns.Topic(this, "SentinelAlertTopic", {
      topicName: "Sentinel-Alerts",

      displayName: "Sentinel Website Health Alerts",
    });

    // ==========================================
    // EMAIL SUBSCRIPTION
    // ==========================================

    alertTopic.addSubscription(
      new subscriptions.EmailSubscription("mohd.malik1@live.vu.edu.au"),
    );

    // ==========================================
    // CONNECT AVAILABILITY ALARMS TO SNS
    // ==========================================

    availabilityAlarms.forEach((alarm) => {
      alarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
    });

    // ==========================================
    // CONNECT LATENCY ALARMS TO SNS
    // ==========================================

    latencyAlarms.forEach((alarm) => {
      alarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
    });

    // ==========================================
    // CONNECT SSL ALARMS TO SNS
    // ==========================================

    sslAlarms.forEach((alarm) => {
      alarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
    });

    // ==========================================
    // CLOUDWATCH DASHBOARD WIDGETS
    // ==========================================

    dashboard.addWidgets(
      // ----------------------------------------
      // Availability
      // ----------------------------------------

      new cloudwatch.GraphWidget({
        title: "Website Availability",

        left: availabilityMetrics,

        leftYAxis: {
          min: 0,
          max: 1,
        },

        width: 12,
      }),

      // ----------------------------------------
      // Latency
      // ----------------------------------------

      new cloudwatch.GraphWidget({
        title: "Website Latency",

        left: latencyMetrics,

        leftYAxis: {
          min: 0,
        },

        width: 12,
      }),

      // ----------------------------------------
      // DNS
      // ----------------------------------------

      new cloudwatch.GraphWidget({
        title: "DNS Resolution Time",

        left: dnsMetrics,

        leftYAxis: {
          min: 0,
        },

        width: 12,
      }),

      // ----------------------------------------
      // SSL
      // ----------------------------------------

      new cloudwatch.GraphWidget({
        title: "SSL Certificate Days Remaining",

        left: sslMetrics,

        leftYAxis: {
          min: 0,
        },

        width: 12,
      }),
    );
  }
}
