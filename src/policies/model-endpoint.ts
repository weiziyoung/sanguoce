export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

/** Require an explicit HTTP endpoint and keep credentials out of URLs. */
export function modelEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('请填写完整的 API 请求地址'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error('API 地址必须为 HTTP/HTTPS，不能包含登录信息或片段');
  return url.href;
}
