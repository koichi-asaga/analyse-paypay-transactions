import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { handle } from './app.ts';
import { S3Store } from './store.ts';

const store = new S3Store(process.env.DATA_BUCKET!);

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : null;
  const res = await handle(
    {
      method: event.requestContext.http.method,
      path: event.rawPath,
      query: event.queryStringParameters ?? {},
      body: body ? new Uint8Array(body) : null,
      // API Gateway の JWT オーソライザで検証済みのクレーム
      userId: String(event.requestContext.authorizer.jwt.claims.sub ?? ''),
    },
    store,
  );
  return {
    statusCode: res.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(res.body),
  };
}
