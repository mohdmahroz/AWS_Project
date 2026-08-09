import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';

export class MahrozProjectStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const monitorLambda = new lambda.NodejsFunction(
      this,
      'SentinelMonitorLambda',
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        entry: 'lambda/monitor.ts',
        handler: 'handler',
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
      }
    );

    new cdk.CfnOutput(this, 'LambdaName', {
      value: monitorLambda.functionName,
    });
  }
}