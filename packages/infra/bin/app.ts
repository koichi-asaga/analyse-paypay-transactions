import { App } from 'aws-cdk-lib';
import { PaypayAnalyzerStack } from '../lib/stack.ts';

const app = new App();
new PaypayAnalyzerStack(app, 'PaypayAnalyzer', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1' },
  allowSelfSignUp: app.node.tryGetContext('allowSelfSignUp') === true || app.node.tryGetContext('allowSelfSignUp') === 'true',
});
