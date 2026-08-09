# Sentinel – Website Health Monitoring Platform

Sentinel is a serverless website health monitoring platform built on
Amazon Web Services (AWS). The project is developed as part of the
NIT6150 Advanced Project at Victoria University.

The platform is designed to monitor the availability and performance
of public websites using AWS Lambda and AWS CDK. The infrastructure is
defined using Infrastructure-as-Code (IaC), allowing the system to be
reproducibly deployed and managed.

---

## Project Overview

Websites are critical infrastructure for modern organisations.
Even short periods of downtime or degraded performance can affect
users, revenue, and trust.

Sentinel aims to provide a lightweight, serverless monitoring platform
that can automatically check public websites and measure their health.

The complete project will be developed in three phases:

- **Phase 1:** Canary Lambda
- **Phase 2:** Crawler, Scheduling, Dashboard, and Multi-Region Deployment
- **Phase 3:** Alarms, Notifications, and Incident Logging

This README currently documents the implementation completed for
**Phase 1**.

---

# Phase 1 – Canary Lambda

## Objective

The objective of Phase 1 is to create a single-region AWS Lambda
function that checks a public website and calculates:

- Website availability
- HTTP status code
- Response latency

The Lambda infrastructure is deployed using AWS CDK.

According to the project proposal, Phase 1 requires a CDK application
that deploys a single-region Lambda function, checks a public website,
computes availability and latency, documents the IAM execution role,
and provides an initial project README.

---

# Architecture

The Phase 1 architecture is:

```text
                  AWS Cloud
                     |
                     |
              AWS Lambda
           SentinelMonitorLambda
                     |
                     |
              HTTPS Request
                     |
                     v
             Public Website
             https://example.com
                     |
                     v
              Health Response
                     |
          +----------+----------+
          |                     |
      Availability           Latency
          |                     |
          +----------+----------+
                     |
                     v
              CloudWatch Logs