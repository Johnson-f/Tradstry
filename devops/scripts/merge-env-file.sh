#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

if (( $# < 4 )); then
  echo "Usage: $0 <target-env> <fragment-env> <allowed-key>..." >&2
  exit 64
fi

target_file="$1"
fragment_file="$2"
shift 2
allowed_keys=("$@")

if [[ ! -f "${target_file}" || -L "${target_file}" ]]; then
  echo "Target env file must be a regular, non-symlink file." >&2
  exit 65
fi

if [[ ! -f "${fragment_file}" || -L "${fragment_file}" ]]; then
  echo "Env fragment must be a regular, non-symlink file." >&2
  exit 66
fi

allowed_list="${allowed_keys[*]}"
awk -v allowed_list="${allowed_list}" '
  BEGIN {
    count = split(allowed_list, allowed, " ")
    for (idx = 1; idx <= count; idx++) approved[allowed[idx]] = 1
  }
  /^[[:space:]]*($|#)/ { next }
  {
    separator = index($0, "=")
    key = separator ? substr($0, 1, separator - 1) : $0
    value = separator ? substr($0, separator + 1) : ""
    if (!(key in approved)) {
      printf "Unapproved env key: %s\n", key > "/dev/stderr"
      invalid = 1
      next
    }
    seen[key]++
    if (value == "") {
      printf "Env key is empty: %s\n", key > "/dev/stderr"
      invalid = 1
    }
  }
  END {
    for (key in approved) {
      if (seen[key] != 1) {
        printf "Env key must appear exactly once: %s\n", key > "/dev/stderr"
        invalid = 1
      }
    }
    exit invalid
  }
' "${fragment_file}"

temporary_file="$(mktemp "${target_file}.tmp.XXXXXX")"
trap 'rm -f "${temporary_file}"' EXIT

awk '
  NR == FNR {
    if ($0 ~ /^[[:space:]]*($|#)/) next
    separator = index($0, "=")
    key = substr($0, 1, separator - 1)
    replacement[key] = $0
    order[++replacement_count] = key
    next
  }
  {
    separator = index($0, "=")
    key = separator ? substr($0, 1, separator - 1) : ""
    if (key in replacement) {
      if (!written[key]++) print replacement[key]
    } else {
      print
    }
  }
  END {
    for (idx = 1; idx <= replacement_count; idx++) {
      key = order[idx]
      if (!written[key]) print replacement[key]
    }
  }
' "${fragment_file}" "${target_file}" >"${temporary_file}"

if file_mode="$(stat -c '%a' "${target_file}" 2>/dev/null)"; then
  :
else
  file_mode="$(stat -f '%Lp' "${target_file}")"
fi
chmod "${file_mode}" "${temporary_file}"
mv -f "${temporary_file}" "${target_file}"
trap - EXIT
