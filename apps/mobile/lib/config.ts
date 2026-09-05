/**
 * Where the API is. Both builds bake in `https://api.<domain>` — the site's own
 * /api/* route goes through CloudFront, which gives an origin sixty seconds and
 * turns a slow map into a 504 (deployment/README.md). So every call the website
 * makes is cross-origin, and the API's ALLOWED_ORIGINS is what lets it through.
 *
 * Empty falls back to same-origin, which is right for a local `expo start`
 * against a proxy and wrong in production: on the deployed site it would be a
 * request to the S3 bucket, which has no /api.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
