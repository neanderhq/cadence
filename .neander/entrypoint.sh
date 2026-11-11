#!/bin/sh
set -eu

bundle=/run/secrets/neander_environment
if [ -f "$bundle" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    case "$line" in *=*) ;; *) exit 1 ;; esac
    key=${line%%=*}
    case "$key" in
      DATABASE_URL|BETTER_AUTH_URL|BETTER_AUTH_SECRET) export "$line" ;;
      *) exit 1 ;;
    esac
  done < "$bundle"
fi

exec "$@"
