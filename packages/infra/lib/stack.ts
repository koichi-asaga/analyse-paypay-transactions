import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnStage, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AccountRecovery, UserPool } from 'aws-cdk-lib/aws-cognito';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export interface PaypayAnalyzerStackProps extends StackProps {
  /** true にすると誰でもサインアップできる。false なら管理者がユーザーを作成する */
  allowSelfSignUp: boolean;
}

export class PaypayAnalyzerStack extends Stack {
  constructor(scope: Construct, id: string, props: PaypayAnalyzerStackProps) {
    super(scope, id, props);

    // 取引データ（ユーザーごとに users/{sub}/ 配下）
    const dataBucket = new Bucket(this, 'DataBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: props.allowSelfSignUp,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: { minLength: 10, requireSymbols: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    const apiFn = new NodejsFunction(this, 'ApiFunction', {
      entry: path('../../api/src/lambda.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(29),
      environment: { DATA_BUCKET: dataBucket.bucketName },
      logGroup: new LogGroup(this, 'ApiLogGroup', { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        // AWS SDK v3 は Lambda ランタイムに同梱されている
        externalModules: ['@aws-sdk/*'],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });
    dataBucket.grantReadWrite(apiFn);

    const httpApi = new HttpApi(this, 'HttpApi', {
      defaultAuthorizer: new HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
        userPoolClients: [userPoolClient],
      }),
    });
    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFn),
    });
    const stage = httpApi.defaultStage?.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 20, throttlingRateLimit: 10 };

    // フロントエンド（SPA）
    const siteBucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // /api/* は同一オリジンで API Gateway に流す（CORS 不要）
    const distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        'api/*': {
          origin: new HttpOrigin(`${httpApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    const webDist = path('../../web/dist');
    if (!existsSync(webDist)) {
      throw new Error(`${webDist} がありません。先に \`npm run build:web\` を実行してください`);
    }
    new BucketDeployment(this, 'DeploySite', {
      sources: [
        Source.asset(webDist),
        Source.jsonData('config.json', {
          auth: 'cognito',
          region: this.region,
          userPoolId: userPool.userPoolId,
          userPoolClientId: userPoolClient.userPoolClientId,
          allowSelfSignUp: props.allowSelfSignUp,
        }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'Url', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'DataBucketName', { value: dataBucket.bucketName });
  }
}
