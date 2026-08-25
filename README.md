# Sentinel – Website Health Monitoring Platform

Sentinel is a serverless website health monitoring platform built using
Amazon Web Services (AWS) and AWS Cloud Development Kit (CDK).

The project is developed as part of the NIT6150 Advanced Project at
Victoria University.

Sentinel automatically monitors public websites and collects information
about website availability, HTTP latency, DNS resolution performance,
and SSL certificate validity.

---

# Project Status

| Phase | Status |
|---|---|
| Phase 1 – Canary Lambda | ✅ Completed |
| Phase 2 – Monitoring, Dashboard and Multi-Region | ✅ Completed |
| Phase 3 – Alarms, Notifications and Incident Logging | ✅ Completed |

---

# Project Overview

The project is developed in multiple phases.

## Phase 1

Phase 1 implements a basic AWS Lambda website health checker.

The Lambda checks a public website and measures:

- Website availability
- HTTP status code
- HTTP response latency

## Phase 2

Phase 2 extends the system into an automated multi-site monitoring
platform.

Phase 2 includes:

- Amazon S3 website configuration
- Multi-site website monitoring
- DNS resolution monitoring
- SSL certificate monitoring
- Custom CloudWatch metrics
- CloudWatch Dashboard
- Amazon EventBridge scheduling
- Five-minute monitoring interval
- Multi-region deployment
- Sydney deployment
- Singapore deployment

## Phase 3

Phase 3 will introduce:

- CloudWatch Alarms
- Amazon SNS notifications
- DynamoDB incident logging
- Failure alerts


---

# Phase 1 – Canary Lambda

## Objective

The objective of Phase 1 was to create a serverless AWS Lambda function
that can monitor a public website.

The Lambda sends an HTTPS request to the configured website and
determines whether the website is available.

It also measures the HTTP response latency.

## Phase 1 Architecture

```text
                 AWS Cloud
                     |
                     v
              AWS Lambda
        SentinelMonitorLambda
                     |
                     v
              HTTPS Request
                     |
                     v
              Public Website
                     |
                     v
             Health Response
                /       \
               /         \
              v           v
        Availability    Latency
               \         /
                \       /
                 v     v
              CloudWatch
                  Logs
