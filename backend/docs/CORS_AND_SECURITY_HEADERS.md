# CORS and Security Headers

This document describes the CORS (Cross-Origin Resource Sharing) and security headers configuration for the MyFans backend.

## Overview

The backend implements secure CORS and response headers to protect against common web vulnerabilities while maintaining flexibility for different environments (development, staging, production).

Security headers are applied in two complementary layers:

1. **[helmet](https://helmetjs.github.io/)** — industry-standard Express middleware that sets a secure baseline for HTTP response headers (registered first in `main.ts`).
2. **`SecurityHeadersMiddleware`** — custom NestJS middleware that applies environment-aware overrides for CSP, HSTS, and cross-origin policies (registered after helmet).

Helmet handles headers it manages; the custom middleware overrides the subset that requires environment-specific logic (e.g. CSP is relaxed in development, HSTS is only set in production).

## Security Headers

The following security headers are applied to all responses:

| Header | Value | Source |
|--------|-------|--------|
| `Content-Security-Policy` | Dynamic (env-based) | `SecurityHeadersMiddleware` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (production only) | `SecurityHeadersMiddleware` |
| `X-Frame-Options` | `DENY` | `SecurityHeadersMiddleware` |
| `X-Content-Type-Options` | `nosniff` | helmet + `SecurityHeadersMiddleware` |
| `X-XSS-Protection` | `1; mode=block` | `SecurityHeadersMiddleware` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `SecurityHeadersMiddleware` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | `SecurityHeadersMiddleware` |
| `Cross-Origin-Embedder-Policy` | `require-corp` | `SecurityHeadersMiddleware` |
| `Cross-Origin-Opener-Policy` | `same-origin` | `SecurityHeadersMiddleware` |
| `Cross-Origin-Resource-Policy` | `same-origin` | `SecurityHeadersMiddleware` |
| `Origin-Agent-Cluster` | `?1` | helmet |
| `X-DNS-Prefetch-Control` | `off` | helmet |
| `X-Download-Options` | `noopen` | helmet |
| `X-Permitted-Cross-Domain-Policies` | `none` | helmet |

### Removed Headers

The following potentially sensitive headers are removed:
- `X-Powered-By` (removed by both helmet and `SecurityHeadersMiddleware`)
- `Server`

## Middleware Order in `main.ts`

```
helmet()                        ← secure baseline (X-DNS-Prefetch-Control, etc.)
SecurityHeadersMiddleware       ← env-aware overrides (CSP, HSTS, cross-origin)
cookieParser()
```

Helmet's `contentSecurityPolicy` and `strictTransportSecurity` options are disabled so the custom middleware has full control over those two headers.

## CORS Configuration

### Development Mode (`NODE_ENV=development`)

In development, the backend is permissive to facilitate local development:

- **Allowed Origins**: All localhost origins automatically allowed
  - `http://localhost:3000`
  - `http://localhost:3001`
  - `http://localhost:5173`
  - `http://localhost:8080`
  - `http://127.0.0.1:*` (same ports)
- **Custom Origins**: Can be added via `CORS_ALLOWED_ORIGINS` environment variable
- **Host Filtering**: Relaxed for `localhost` and `127.0.0.1`

### Production Mode (`NODE_ENV=production`)

In production, the backend is strict:

- **Allowed Origins**: Only origins explicitly listed in `CORS_ALLOWED_ORIGINS`
- **Allowed Hosts**: Only hosts explicitly listed in `CORS_ALLOWED_HOSTS`
- **Default Behavior**: If no allowlist is configured, all CORS requests are blocked

## Environment Variables

### Backend Environment Variables

Add these to your `backend/.env` file:

```bash
# CORS Configuration
# Comma-separated list of allowed origins
CORS_ALLOWED_ORIGINS=https://myfans.example.com,https://www.myfans.example.com

# Comma-separated list of allowed hosts (for additional host-based filtering)
CORS_ALLOWED_HOSTS=myfans.example.com,www.myfans.example.com
```

### Content Security Policy (CSP)

The CSP is automatically adjusted based on environment:

**Development:**
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src *
```

**Production:**
```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self' data:; connect-src [CORS_ALLOWED_ORIGINS]; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

## CORS Behavior

### Allowed Methods
- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `OPTIONS` (preflight)

### Allowed Headers
- `Content-Type`
- `Authorization`
- `X-Requested-With`
- `X-Correlation-ID`
- `X-Request-ID`
- `Accept`
- `Origin`

### Exposed Headers
- `X-Correlation-ID`
- `X-Request-ID`
- `Content-Length`
- `Content-Range`

### Credentials
- `Access-Control-Allow-Credentials: true` is always set
- Cookies and authentication headers are allowed in cross-origin requests

## Testing

### Unit Tests

Run unit tests for the middleware and service:

```bash
cd backend
npm test -- security-headers.middleware.spec.ts
npm test -- cors.service.spec.ts
```

### E2E Tests

Run end-to-end tests to verify CORS and security headers behavior:

```bash
cd backend
npm run test:e2e -- cors-security.e2e-spec.ts
```

### Manual Testing

Test CORS preflight:

```bash
curl -X OPTIONS http://localhost:3000/ \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  -i
```

Check security headers:

```bash
curl -I http://localhost:3000/
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ALLOWED_ORIGINS` with your production domains
- [ ] Configure `CORS_ALLOWED_HOSTS` with your production hosts
- [ ] Verify HSTS header is present
- [ ] Verify CSP is restrictive (no `'unsafe-inline'` for scripts)
- [ ] Test CORS with production frontend URLs
- [ ] Verify `X-Powered-By` header is removed
- [ ] Run E2E tests in staging environment

## Troubleshooting

### CORS Errors in Browser

**Error**: "No 'Access-Control-Allow-Origin' header is present"

**Solutions**:
1. Ensure the frontend origin is in `CORS_ALLOWED_ORIGINS`
2. Check that `NODE_ENV` is set correctly
3. Verify the backend is receiving the `Origin` header
4. Check browser console for the exact error message

### Security Headers Missing

**Issue**: Security headers not appearing in responses

**Solutions**:
1. Ensure `helmet()` is called before `SecurityHeadersMiddleware` in `main.ts`
2. Ensure `SecurityHeadersMiddleware` is registered in `main.ts`
3. Check that no other middleware is overriding the headers
4. Verify the middleware is applied before route handlers

### CSP Violations

**Error**: Content Security Policy blocking legitimate resources

**Solutions**:
1. Review CSP violation reports in browser console
2. Adjust CSP directives in `security-headers.middleware.ts`
3. Consider using CSP reporting endpoint for monitoring
4. Test changes in development before production

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Incoming Request                      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              CORS Middleware (NestJS built-in)           │
│  - Origin validation                                     │
│  - Preflight handling                                    │
│  - CORS headers                                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  helmet() (npm package)                  │
│  - X-DNS-Prefetch-Control, X-Download-Options, etc.      │
│  - Secure baseline; CSP/HSTS disabled (custom handles)   │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│         Security Headers Middleware (Custom)             │
│  - CSP (env-aware), HSTS (production-only)               │
│  - X-Frame-Options, Referrer-Policy, Permissions-Policy  │
│  - Cross-Origin-* policies                               │
│  - Remove X-Powered-By, Server                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│         Correlation ID Middleware (Custom)               │
│  - Generate/propagate correlation IDs                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Logging Middleware (Custom)                 │
│  - Request/response logging                              │
│  - Redaction of sensitive data                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Route Handlers                        │
└─────────────────────────────────────────────────────────┘
```

## References

- [helmet documentation](https://helmetjs.github.io/)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)


This document describes the CORS (Cross-Origin Resource Sharing) and security headers configuration for the MyFans backend.

## Overview

The backend implements secure CORS and response headers to protect against common web vulnerabilities while maintaining flexibility for different environments (development, staging, production).

## Security Headers

The following security headers are applied to all responses:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | Dynamic (env-based) | Prevents XSS and data injection attacks |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Enforces HTTPS |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS protection for older browsers |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Restricts browser features |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Isolates browsing context |
| `Cross-Origin-Opener-Policy` | `same-origin` | Prevents cross-origin window access |
| `Cross-Origin-Resource-Policy` | `same-origin` | Restricts resource loading |

### Removed Headers

The following potentially sensitive headers are removed:
- `X-Powered-By`
- `Server`

## CORS Configuration

### Development Mode (`NODE_ENV=development`)

In development, the backend is permissive to facilitate local development:

- **Allowed Origins**: All localhost origins automatically allowed
  - `http://localhost:3000`
  - `http://localhost:3001`
  - `http://localhost:5173`
  - `http://localhost:8080`
  - `http://127.0.0.1:*` (same ports)
- **Custom Origins**: Can be added via `CORS_ALLOWED_ORIGINS` environment variable
- **Host Filtering**: Relaxed for `localhost` and `127.0.0.1`

### Production Mode (`NODE_ENV=production`)

In production, the backend is strict:

- **Allowed Origins**: Only origins explicitly listed in `CORS_ALLOWED_ORIGINS`
- **Allowed Hosts**: Only hosts explicitly listed in `CORS_ALLOWED_HOSTS`
- **Default Behavior**: If no allowlist is configured, all CORS requests are blocked

## Environment Variables

### Backend Environment Variables

Add these to your `backend/.env` file:

```bash
# CORS Configuration
# Comma-separated list of allowed origins
CORS_ALLOWED_ORIGINS=https://myfans.example.com,https://www.myfans.example.com

# Comma-separated list of allowed hosts (for additional host-based filtering)
CORS_ALLOWED_HOSTS=myfans.example.com,www.myfans.example.com
```

### Content Security Policy (CSP)

The CSP is automatically adjusted based on environment:

**Development:**
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src *
```

**Production:**
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src [CORS_ALLOWED_ORIGINS]; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

## CORS Behavior

### Allowed Methods
- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `OPTIONS` (preflight)

### Allowed Headers
- `Content-Type`
- `Authorization`
- `X-Requested-With`
- `X-Correlation-ID`
- `X-Request-ID`
- `Accept`
- `Origin`

### Exposed Headers
- `X-Correlation-ID`
- `X-Request-ID`
- `Content-Length`
- `Content-Range`

### Credentials
- `Access-Control-Allow-Credentials: true` is always set
- Cookies and authentication headers are allowed in cross-origin requests

## Testing

### Unit Tests

Run unit tests for the middleware and service:

```bash
cd backend
npm test -- security-headers.middleware.spec.ts
npm test -- cors.service.spec.ts
```

### E2E Tests

Run end-to-end tests to verify CORS and security headers behavior:

```bash
cd backend
npm run test:e2e -- cors-security.e2e-spec.ts
```

### Manual Testing

Test CORS preflight:

```bash
curl -X OPTIONS http://localhost:3000/ \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  -i
```

Check security headers:

```bash
curl -I http://localhost:3000/
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ALLOWED_ORIGINS` with your production domains
- [ ] Configure `CORS_ALLOWED_HOSTS` with your production hosts
- [ ] Verify HSTS header is present
- [ ] Verify CSP is restrictive (no `'unsafe-inline'` for scripts)
- [ ] Test CORS with production frontend URLs
- [ ] Verify `X-Powered-By` header is removed
- [ ] Run E2E tests in staging environment

## Troubleshooting

### CORS Errors in Browser

**Error**: "No 'Access-Control-Allow-Origin' header is present"

**Solutions**:
1. Ensure the frontend origin is in `CORS_ALLOWED_ORIGINS`
2. Check that `NODE_ENV` is set correctly
3. Verify the backend is receiving the `Origin` header
4. Check browser console for the exact error message

### Security Headers Missing

**Issue**: Security headers not appearing in responses

**Solutions**:
1. Ensure `SecurityHeadersMiddleware` is registered in `main.ts`
2. Check that no other middleware is overriding the headers
3. Verify the middleware is applied before route handlers

### CSP Violations

**Error**: Content Security Policy blocking legitimate resources

**Solutions**:
1. Review CSP violation reports in browser console
2. Adjust CSP directives in `security-headers.middleware.ts`
3. Consider using CSP reporting endpoint for monitoring
4. Test changes in development before production

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Incoming Request                      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              CORS Middleware (NestJS built-in)           │
│  - Origin validation                                     │
│  - Preflight handling                                    │
│  - CORS headers                                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│         Security Headers Middleware (Custom)             │
│  - CSP, HSTS, X-Frame-Options, etc.                      │
│  - Remove sensitive headers                              │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│         Correlation ID Middleware (Custom)               │
│  - Generate/propagate correlation IDs                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Logging Middleware (Custom)                 │
│  - Request/response logging                              │
│  - Redaction of sensitive data                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Route Handlers                      │
└─────────────────────────────────────────────────────────┘
```

## References

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
