FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip git ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Dedicated unprivileged user for the sandboxed work.
RUN useradd -m -u 1000 sandbox

USER sandbox
WORKDIR /workspace

CMD ["/bin/bash"]
