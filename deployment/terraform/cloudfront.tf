locals {
  s3_origin_id  = "web-s3"
  api_origin_id = "api-lambda"

  # The shared Lightsail host, reached over https on the hostname Caddy holds a
  # certificate for. Defined in api-origin.tf alongside the record that resolves it.
  api_origin_domain = local.api_host

  # AWS-managed policies (fixed, documented IDs).
  cache_policy_caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_policy_caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  # Forwards everything except Host — required for Lambda Function URL
  # origins, whose TLS cert only matches their own hostname.
  origin_policy_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.app_name}-web-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Redirects www to the apex, and rewrites extension-less paths to
# /index.html so client-side routes work on the single-page Expo export.
# Deliberately a viewer-request function rather than distribution-wide
# custom_error_responses: those would also rewrite the API's 403s into the
# SPA page.
resource "aws_cloudfront_function" "viewer_request" {
  name    = "${var.app_name}-viewer-request"
  runtime = "cloudfront-js-2.0"
  publish = true

  code = templatefile("${path.module}/functions/viewer-request.js.tftpl", {
    domain_name = var.domain_name
  })
}

# HSTS, so a browser that has seen the site once never tries http again.
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.app_name}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.app_name} web + API"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.domain_name, "www.${var.domain_name}"]

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.api_origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]

      # 60s is the maximum available without a quota increase, up from the 30s
      # default. It is still not enough for a map generation, which is why both
      # builds now call api.<domain> directly and this path exists only for the
      # APKs that baked the site in — see "The app does not call the API through
      # CloudFront" in deployment/README.md. Anything served from here is
      # therefore still on a sixty-second leash.
      origin_keepalive_timeout = 60
      origin_read_timeout      = 60
    }
  }

  default_cache_behavior {
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_caching_optimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }
  }

  # Kept for older clients rather than for the current app: an APK bakes its API
  # URL in at build time, so a phone with an earlier build installed is still
  # calling the site. Nothing here is cached (caching_disabled), so this route
  # only forwards.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = local.api_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_caching_disabled
    origin_request_policy_id   = local.origin_policy_all_viewer_except_host
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    # Shares the function so www.<domain>/api/... redirects to the apex too;
    # the function skips the SPA rewrite for /api/ paths.
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.web.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # The API origin is a hostname rather than an AWS resource, so nothing else
  # ties the two together: without this the distribution can go live pointing at
  # a name that does not resolve yet, and Caddy cannot obtain its certificate
  # until it does.
  depends_on = [aws_route53_record.api]
}
