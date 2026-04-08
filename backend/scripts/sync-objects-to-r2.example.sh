#!/usr/bin/env bash
# Example: copy objects from a legacy S3-compatible source into R2 preserving keys.
# Install rclone (https://rclone.org/) and configure two remotes, e.g. `legacy` and `r2`,
# then adjust bucket names and run:
#
#   rclone copy legacy:OLD_BUCKET r2:NEW_BUCKET --progress
#
# Use the same bucket name and keys as in your DB (`/s3/{bucket}/{object}`) to avoid SQL updates.

set -euo pipefail
echo "This file is a runbook stub — edit remotes and buckets, then run rclone (or aws s3 sync) manually."
